package data

import (
	"github.com/jinzhu/gorm"
	"fmt"
	"strings"
)

func (ctx DShifts) verifyShift(id *int, shift Shift, db *gorm.DB) *DError {
	// Verify that the shift even exists.
	if id != nil && !ctx.shiftExists(*id, db) {
		return NewNotFoundError(fmt.Sprintf("Error, shift ID %d cannot be updated because it doesn't exist.", *id))
	}

	if shift.Break != nil && *shift.Break < 0 {
		return NewClientError("Error, break must be non-negative.", nil)
	}

	// Verify the user/managers related actually exist and are proper
	if role, err := ctx.Users().GetUserRole(*shift.ManagerID); err != nil {
		return NewServerError("Error, could not verify manager_id.", err)
	} else if *role == "employee" {
		return NewClientError(fmt.Sprintf("Error, user ID %d is not a manager.", *shift.ManagerID), nil)
	} else if role == nil {
		return NewNotFoundError(fmt.Sprintf("Error, manager_id %d does not exist.", *shift.ManagerID))
	}

	// Validate that the start and end times of the new or updated shift are in the right order.
	if err := validateShiftStartAndEndTimes(id, shift, db); err != nil {
		return err
	}

	// Validate that the shift does not overlap with another shift for the employee (if assigned)
	if err := ctx.getOverlappingShiftsForEmployeeID(id, shift, db); err != nil {
		return err
	}

	return nil
}

func (ctx DShifts) shiftExists(id int, db *gorm.DB) bool {
	count := 0
	db.
		Table("public.vw_shifts_api").
		Where("id = ?", id).
		Count(&count)
	return count == 1
}

func (ctx DShifts) cleanShift(id *int, shift *Shift) *DError {
	if id == nil { // If the shift doesn't exist yet verify the start and end times are included
		if shift.StartTime == nil || strings.TrimSpace(*shift.StartTime) == "" {
			return NewClientError("Error, start_time cannot be null or blank.", nil)
		}

		if shift.EndTime == nil || strings.TrimSpace(*shift.EndTime) == "" {
			return NewClientError("Error, end_time cannot be null or blank.", nil)
		}
	} else { // Sometimes during an update the times will come through as "" instead of nil.
		if shift.StartTime != nil && strings.TrimSpace(*shift.StartTime) == "" {
			shift.StartTime = nil
		}
		if shift.EndTime != nil && strings.TrimSpace(*shift.EndTime) == "" {
			shift.EndTime = nil
		}
	}
	// This code has a side effect. If the user is updating an existing shift;
	// 		this might change the manager_id if they leave it null in the request json.
	if shift.ManagerID == nil { // If they don't specify the manager, use the current user.
		shift.ManagerID = &ctx.UserID
	}
	return nil
}

func getExistingEmployeeIDForShift(id int, db *gorm.DB) *int {
	eid := struct{
		EmployeeID *int
	}{}
	db.
		Table("public.vw_shifts_api").
		Where("id = ?", id).
		Select("employee_id").
		First(&eid)
	return eid.EmployeeID
}

func (ctx DShifts) getOverlappingShiftsForEmployeeID(current_shift_id *int, shift Shift, db *gorm.DB) (*DError) {
	var employee_id *int = shift.EmployeeID

	// If they don't specify the employee for an existing shift, retrieve it so we can make sure there are no conflicts.
	if employee_id == nil && current_shift_id != nil {
		employee_id = getExistingEmployeeIDForShift(*current_shift_id, db)
	}

	// If the employee id is not null we want to verify
	// that this shift will not conflict with another shift.
	if employee_id != nil && *employee_id != -1 {
		if role, err := ctx.Users().GetUserRole(*employee_id); err != nil {
			return NewServerError("Error, could not verify employee_id.", err)
		} else if role == nil {
			return NewNotFoundError(fmt.Sprintf("Error, employee_id %d does not exist.", *shift.ManagerID))
		}

		start, end := shift.StartTime, shift.EndTime

		actual := struct {
			StartTime string
			EndTime   string
		}{}
		if current_shift_id != nil && ((start == nil || strings.TrimSpace(*start) == "") || (end == nil || strings.TrimSpace(*end) == "")) {
			// If this is an update and the start or end time is not provided, retrieve it so it can be validated.
			db.
				Table("public.vw_shifts_api").
				Select("start_time, end_time").
				Where("id = ?", *current_shift_id).
				First(&actual)
			if start == nil || strings.TrimSpace(*start) == "" {
				start = &actual.StartTime
			}
			if end == nil || strings.TrimSpace(*end) == "" {
				end = &actual.EndTime
			}
		}

		// Verify that the new times do not overlap with any other times for that user.
		ids := make([]struct {
			ID string
		}, 0)
		d := db.
			Table("public.vw_shifts_api").
			Select("id").
			Where("employee_id = ?", *employee_id).
			// This will filter and return any shifts that overlap with the start and end timestamps provided.
			Where("(?::timestamp < end_time::timestamp AND ?::timestamp >= start_time::timestamp) " +
				"OR " +
				"(?::timestamp > start_time::timestamp AND ?::timestamp <= end_time::timestamp) " +
				"OR " +
				"(?::timestamp <= start_time::timestamp AND ?::timestamp >= end_time::timestamp)",
				*start, *start, *end, *end, *start, *end)
		if current_shift_id != nil { // If this is an update, make sure we exclude the existing shift.
			d = d.Where("id != ?", *current_shift_id)
		}
		if err := d.Scan(&ids).Error; err != nil {
			return NewServerError("Error, could not validate conflicting shifts.", err)
		}
		if len(ids) > 0 {
			conflictingShifts := make([]string, len(ids))
			for i, shiftid := range ids {
				conflictingShifts[i] = shiftid.ID
			}
			return NewClientError(fmt.Sprintf("Error, %d shift(s) already exist for user ID %d during the start -> end time. Conflicting shift(s): %s.", len(ids), *employee_id, strings.Join(conflictingShifts, ", ")), nil)
		}
	}
}

func validateShiftStartAndEndTimes(id *int, shift Shift, db *gorm.DB) (*DError) {
	valid_start_end := make([]struct {
		Valid bool
	}, 0)
	// Verify that the timestamps are correct even before we insert/update.
	// I'm doing this in SQL so that almost any date format could be provided.
	// In GO to parse a date I need to know the format, in PostgreSQL it's much more forgiving.
	if id == nil || (shift.StartTime != nil && shift.EndTime != nil) {
		db.Raw("SELECT ?::timestamp < ?::timestamp AS valid", *shift.StartTime, *shift.EndTime).Scan(&valid_start_end)
		if len(valid_start_end) > 0 {
			if !valid_start_end[0].Valid {
				return NewClientError(fmt.Sprintf("Error, (start_time: %s) must come before (end_time: %s).", *shift.StartTime, *shift.EndTime), nil)
			}
		}
	} else if shift.StartTime != nil || shift.EndTime != nil {
		if shift.StartTime != nil {
			db.Raw("SELECT ?::timestamp < end_time AS valid FROM public.shifts WHERE id = ?;", *shift.StartTime, *id)
		} else if shift.EndTime != nil {
			db.Raw("SELECT ?::timestamp > start_time AS valid FROM public.shifts WHERE id = ?;", *shift.EndTime, *id)
		}
		if len(valid_start_end) > 0 {
			if !valid_start_end[0].Valid {
				if shift.StartTime != nil {
					return NewClientError(fmt.Sprintf("Error, (start_time: %s) must come before end_time.", *shift.StartTime), nil)
				} else {
					return NewClientError(fmt.Sprintf("Error, (end_time: %s) must come after start_time.", *shift.EndTime), nil)
				}
			}
		}
	}
	return nil
}


