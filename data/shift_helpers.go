package data

import (
	"github.com/jinzhu/gorm"
)

func (ctx DShifts) shiftExists(id int, db *gorm.DB) bool {
	count := 0
	db.
		Table("public.vw_shifts_api").
		Where("id = ?", id).
		Count(&count)
	return count == 1
}
