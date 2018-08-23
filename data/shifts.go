package data

import (
	"github.com/ECourant/standards/filtering"
	"github.com/jinzhu/gorm"
	"github.com/ECourant/standards/conf"
	"encoding/json"
	"fmt"
	)

var (
	ShiftConstraints = filtering.GenerateConstraints(Shift{})
)

type DShifts struct {
	DSession
}

func (ctx DShifts) Constraints() filtering.RequestConstraints {
	return ShiftConstraints
}

type Shift struct {
	ID              *int     `json:"id,omitempty" query:"27" name:"ID"`
	ManagerID       *int     `json:"manager_id,omitempty" query:"11" name:"Manager ID"`
	ManagerUserObj  *User    `json:"manager_user,omitempty" query:"8" name:"Manager User"`
	EmployeeID      *int     `json:"employee_id,omitempty" query:"11" name:"Employee ID"`
	EmployeeUserObj *User    `json:"employee_user,omitempty" query:"8" name:"Employee User"`
	Break           *float64 `json:"break,omitempty" query:"11" name:"Break"`
	StartTime       *string  `json:"start_time,omitempty" query:"11" name:"Start Time" range:"starting"`
	EndTime         *string  `json:"end_time,omitempty" query:"11" name:"End Time" range:"ending"`
	CreatedAt       *string  `json:"created_at,omitempty" query:"11" name:"Created At"`
	UpdatedAt       *string  `json:"updated_at,omitempty" query:"11" name:"Updated At"`
}

// The row object is used to parse the json columns for employee and manager sub objects.
type shiftRow struct {
	Shift
	ManagerUser  *string `json:"manager_user,omitempty" query:"11" name:"Manager User"`
	EmployeeUser *string `json:"employee_user,omitempty" query:"11" name:"Employee User"`
}

type ShiftDetail struct {
	Shift
	HoursFormatted *string `json:"hours_formatted" query:"11" name:"Hours Formatted"`
	ShiftItems     []Shift `json:"shifts,omitempty" query:"8" name:"Shifts"`
}

type shiftDetailRow struct {
	ShiftDetail
	ManagerUser  *string `json:"manager_user,omitempty" query:"11" name:"Manager User"`
	EmployeeUser *string `json:"employee_user,omitempty" query:"11" name:"Employee User"`
	Shifts       *string `json:"shifts,omitempty" query:"8" name:"Shifts"`
}

type UsersAvailable struct {
	ID             int    `json:"id"`
	UsersAvailable []User `json:"users_available"`
}

// Parse the row object and return the resulting shift object with any extra details.
func rowsToShifts(rows []shiftRow) []Shift {
	result := make([]Shift, len(rows))
	for i, row := range rows {
		shift := row.Shift
		if row.ManagerUser != nil {
			json.Unmarshal([]byte(*row.ManagerUser), &shift.ManagerUserObj)
		}
		if row.EmployeeUser != nil {
			json.Unmarshal([]byte(*row.EmployeeUser), &shift.EmployeeUserObj)
		}
		result[i] = shift
	}
	return result
}

func rowsToShiftDetails(rows []shiftDetailRow) []ShiftDetail {
	result := make([]ShiftDetail, len(rows))
	for i, row := range rows {
		shift := row.ShiftDetail
		if row.ManagerUser != nil {
			json.Unmarshal([]byte(*row.ManagerUser), &shift.ManagerUserObj)
		}
		if row.EmployeeUser != nil {
			json.Unmarshal([]byte(*row.EmployeeUser), &shift.EmployeeUserObj)
		}
		if row.Shifts != nil {
			json.Unmarshal([]byte(*row.Shifts), &shift.ShiftItems)
		}
		result[i] = shift
	}
	return result
}

func (ctx DShifts) GetShifts(params filtering.RequestParams) ([]Shift, *DError) {
	db, err := gorm.Open("postgres", conf.Cfg.ConnectionString)
	if err != nil {
		return nil, NewServerError("Error, could not retrieve shifts at this time.", err)
	}
	defer db.Close()

	result := make([]shiftRow, 0)

	db = db.
		Table("public.vw_shifts_api").
		Select(params.Fields).
		Order(params.Sorts).
		Offset((params.Page * params.PageSize) - params.PageSize).
		Limit(params.PageSize)

	if len(params.Filters) > 0 || params.DateRange != nil {
		db = filtering.WhereFilters(db, params, ctx.Constraints())
	}

	db.Scan(&result)
	return rowsToShifts(result), nil
}

func (ctx DShifts) GetMyShifts(params filtering.RequestParams) ([]Shift, *DError) {
	db, err := gorm.Open("postgres", conf.Cfg.ConnectionString)
	if err != nil {
		return nil, NewServerError("Error, could not retrieve shifts at this time.", err)
	}
	defer db.Close()

	result := make([]shiftRow, 0)

	db = db.
		Table("public.vw_shifts_api").
		Select(params.Fields).
		Order(params.Sorts).
		Offset((params.Page * params.PageSize) - params.PageSize).
		Limit(params.PageSize).
		Where("(employee_id = ? OR employee_id IS NULL)", ctx.UserID)

	if len(params.Filters) > 0 || params.DateRange != nil {
		db = filtering.WhereFilters(db, params, ctx.Constraints())
	}

	db.Scan(&result)
	return rowsToShifts(result), nil
}

func (ctx DShifts) GetShiftDetails(params filtering.RequestParams, id int) (*ShiftDetail, *DError) {
	db, err := gorm.Open("postgres", conf.Cfg.ConnectionString)
	if err != nil {
		return nil, NewServerError("Error, could not retrieve shifts at this time.", err)
	}
	defer db.Close()

	result := make([]shiftDetailRow, 0)

	db = db.
		Table("public.vw_shifts_detailed_api").
		Select(params.Fields).
		Offset((params.Page * params.PageSize) - params.PageSize).
		Limit(params.PageSize).
		Where("id = ?", id)

	if len(params.Filters) > 0 || params.DateRange != nil {
		db = filtering.WhereFilters(db, params, ctx.Constraints())
	}

	db.Scan(&result)
	return &rowsToShiftDetails(result)[0], nil
}

func (ctx DShifts) GetNonConflictingUsers(id int) (*UsersAvailable, *DError) {
	db, err := gorm.Open("postgres", conf.Cfg.ConnectionString)
	if err != nil {
		return nil, NewServerError("Error, could not retrieve shifts at this time.", err)
	}
	defer db.Close()

	result := make([]struct {
		ID             int
		UsersAvailable string
	}, 0)

	db = db.
		Table("public.vw_shifts_available_users").
		Select("id, users_available").
		Where("id = ?", id)

	db.Scan(&result)
	final := make([]UsersAvailable, len(result))
	for i, row := range result {
		item := UsersAvailable{
			ID:             row.ID,
			UsersAvailable: make([]User, 0),
		}
		if row.UsersAvailable != "[]" {
			json.Unmarshal([]byte(row.UsersAvailable), &item.UsersAvailable)
		}
		final[i] = item
	}
	return &final[0], nil
}

func (ctx DShifts) CreateShift(shift Shift) (response *Shift, rerr *DError) {
	db, err := gorm.Open("postgres", conf.Cfg.ConnectionString)
	if err != nil {
		return nil, NewServerError("Error, could not retrieve shifts at this time.", err)
	}
	defer db.Close()

	result := make([]shiftRow, 0)

	db = db.Begin()
	// I hate how this looks in golang, but basically if there is a panic or an error somewhere further down, the transaction will rollback.
	defer func() {
		if r := recover(); r != nil {
			db.Rollback()
			response = nil
			rerr = NewServerError("Error, could not create shift at this time.", err)
			return
		}
	}()

	if shift.Break == nil {
		b := 0.0
		shift.Break = &b
	}

	if err := ctx.cleanShift(nil, &shift); err != nil {
		return nil, err
	}

	if err := ctx.verifyShift(nil, shift, db); err != nil {
		return nil, err
	}

	if err := db.Raw(`INSERT INTO public.shifts (manager_id,employee_id,break,start_time,end_time)
				 VALUES(?, ?, ?, ?::timestamp, ?::timestamp) 
        		 RETURNING 
					id,
					manager_id,
					employee_id,
					break,
					to_char(start_time, 'Dy, Mon DD HH24:MI:SS.MS YYYY') AS start_time,
					to_char(end_time, 'Dy, Mon DD HH24:MI:SS.MS YYYY') AS end_time,
					to_char(created_at, 'Dy, Mon DD HH24:MI:SS.MS YYYY') AS created_at,
					to_char(updated_at, 'Dy, Mon DD HH24:MI:SS.MS YYYY') AS updated_at;`, shift.ManagerID, shift.EmployeeID, shift.Break, shift.StartTime, shift.EndTime).Scan(&result).Error; err != nil {
		db.Rollback()
		return nil, NewServerError("Error, an unexpected error occurred. The shift was not created.", err)
	}
	db.Commit()
	return &rowsToShifts(result)[0], nil
}

func (ctx DShifts) UpdateShift(id int, shift Shift) (response *Shift, rerr *DError) {
	db, err := gorm.Open("postgres", conf.Cfg.ConnectionString)
	if err != nil {
		return nil, NewServerError("Error, could not retrieve shifts at this time.", err)
	}
	defer db.Close()

	db = db.Begin()
	// I hate how this looks in golang, but basically if there is a panic or an error somewhere further down, the transaction will rollback.
	defer func() {
		if r := recover(); r != nil {
			db.Rollback()
			response = nil
			rerr = NewServerError("Error, could not update shift at this time.", err)
			return
		}
	}()

	if err := ctx.cleanShift(&id, &shift); err != nil {
		return nil, err
	}

	if err := ctx.verifyShift(&id, shift, db); err != nil {
		return nil, err
	}

	result := make([]shiftRow, 0)

	if err := db.Raw(`
		UPDATE public.shifts SET
			manager_id=COALESCE(?, manager_id),
			employee_id=NULLIF(COALESCE(?, manager_id), -1),
			break=COALESCE(?, break),
			start_time=COALESCE(?::timestamp, start_time),
			end_time=COALESCE(?::timestamp, end_time),
			updated_at=LOCALTIMESTAMP
		WHERE id=?
		RETURNING id,
				  manager_id,
				  employee_id,
				  break,
				  to_char(start_time, 'Dy, Mon DD HH24:MI:SS.MS YYYY') AS start_time,
				  to_char(end_time, 'Dy, Mon DD HH24:MI:SS.MS YYYY') AS end_time,
				  to_char(created_at, 'Dy, Mon DD HH24:MI:SS.MS YYYY') AS created_at,
				  to_char(updated_at, 'Dy, Mon DD HH24:MI:SS.MS YYYY') AS updated_at;
	`, shift.ManagerID, shift.EmployeeID, shift.Break, shift.StartTime, shift.EndTime, id).Scan(&result).Error; err != nil {
		db.Rollback()
		return nil, NewServerError("Error, an unexpected error occurred. The shift was not updated.", err)
	}
	db.Commit()
	return &rowsToShifts(result)[0], nil
}

func (ctx DShifts) DeleteShift(id int) (rerr *DError) {
	db, err := gorm.Open("postgres", conf.Cfg.ConnectionString)
	if err != nil {
		return NewServerError("Error, could not delete shift at this time.", err)
	}
	defer db.Close()
	db = db.Begin()
	// I hate how this looks in golang, but basically if there is a panic or an error somewhere further down, the transaction will rollback.
	defer func() {
		if r := recover(); r != nil {
			db.Rollback()
			rerr = NewServerError("Error, could not delete shift at this time.", err)
			return
		}
	}()
	if err := db.Exec("DELETE FROM public.shifts WHERE id = ?;", id).Error; err != nil {
		db.Rollback()
		return NewServerError(fmt.Sprintf("Error, failed to delete shift ID %d.", id), err)
	}
	db.Commit()
	return nil
}