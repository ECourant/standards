(function () {
    // Helpers
    // I added these in to help a bit with displaying some data in a user friendly way using Framework7
    Template7.registerHelper('title_case', function (str) {
        str = str.toLowerCase().split(' ');
        for (let i = 0; i < str.length; i++) {
            str[i] = str[i].charAt(0).toUpperCase() + str[i].slice(1);
        }
        return str.join(' ');
    });

    Template7.registerHelper('role_badge', function (role) {
        if (role == "employee") {
            return "color-blue"
        } else if (role == "manager") {
            return "color-orange"
        }
    });

    Template7.registerHelper('format_date', function (date) {
        return moment(date).format("llll");
    });

    // Views
    // Framework7 breaks up all the views into separate "Templates" which it then renders with context data I provide
    let homeView = Template7.compile(Dom7("#homeView").html());
    let appView = Template7.compile(Dom7("#appView").html());
    let shiftsFiltersView = Template7.compile(Dom7("#shiftsFiltersView").html());
    let shiftDetailsView = Template7.compile(Dom7("#shiftDetailsView").html());
    let summariesFiltersView = Template7.compile(Dom7("#summariesFiltersView").html());
    let changeEmployeeView = Template7.compile(Dom7("#changeEmployeeView").html());
    let createShiftView = Template7.compile(Dom7("#createShiftView").html());
    let editShiftTimeView = Template7.compile(Dom7("#editShiftTimeView").html());


    // This entire section of variables is used to cache or keep track of data needed for the UI or for querying the REST API for more data.
    let current_user_id = -1;
    let current_user_name = "";
    let current_user_is_manager = false;
    let current_date = new Date();

    // The filter variables will be used to generate urls for API requests.
    let current_shifts_filter = {
        show_only_my_shifts: true,
        date_from: new Date(new Date().setDate(current_date.getDate() - 7)),
        date_to: new Date(),
        page: 1,
        page_size: 1000,
        base_url: "http://localhost:8080/api/shifts",
        sort: " start_time",
        message: "Showing shifts for the next 7 days.",
        GetShiftURL: function () {
            let url = this.base_url;
            let params = ["current_user_id=" + current_user_id];

            if (this.show_only_my_shifts) {
                url += "/mine";
            }
            this.message = "Showing shifts from " + parseDateToURLParam(this.date_from) + " to " + parseDateToURLParam(this.date_to);
            params.push("date_from=" + parseDateToURLParam(this.date_from));
            params.push("date_to=" + parseDateToURLParam(this.date_to));
            params.push("page=" + this.page);
            params.push("page_size=" + this.page_size);
            params.push("order=" + encodeURI(this.sort));
            url = url + "?" + params.join("&");
            return url;
        },
        Reset: function () {
            this.show_only_my_shifts = true;
            this.date_from = new Date();
            this.date_to = new Date(new Date().setDate(current_date.getDate() + 7));
            this.page = 1;
            this.page_size = 10;
            this.message = "Showing shifts from " + parseDateToURLParam(this.date_from) + " to " + parseDateToURLParam(this.date_to);
        }
    };
    let current_summary_filter = {
        date_from: new Date(new Date().setDate(current_date.getDate() - 14)),
        date_to: new Date(new Date().setDate(current_date.getDate() + 7)),
        page: 1,
        page_size: 1000,
        base_url: "http://localhost:8080/api/summaries",
        sort: "-week_start",
        message: "Showing shifts for the next 14 days.",
        GetSummariesURL: function () {
            let url = this.base_url + "/" + current_user_id;
            let params = ["current_user_id=" + current_user_id];

            this.message = "Showing shifts from " + parseDateToURLParam(this.date_from) + " to " + parseDateToURLParam(this.date_to);
            params.push("date_from=" + parseDateToURLParam(this.date_from));
            params.push("date_to=" + parseDateToURLParam(this.date_to));
            params.push("page=" + this.page);
            params.push("page_size=" + this.page_size);
            params.push("order=" + encodeURI(this.sort));
            url = url + "?" + params.join("&");
            return url;
        },
        Reset: function () {
            this.date_from = new Date(new Date().setDate(current_date.getDate() - 14));
            this.date_to = new Date(new Date().setDate(current_date.getDate() + 7));
            this.page = 1;
            this.page_size = 10;
            this.message = "Showing shifts from " + parseDateToURLParam(this.date_from) + " to " + parseDateToURLParam(this.date_to);
        }
    };
    let current_overlapping_filter = {
        id: -1,
        page: 1,
        page_size: 1000,
        base_url: "http://localhost:8080/api/shifts/overlapping",
        GetOverlappingURL: function () {
            let url = this.base_url + "/" + this.id;
            let params = ["current_user_id=" + current_user_id];

            params.push("page=" + this.page);
            params.push("page_size=" + this.page_size);
            url = url + "?" + params.join("&");
            return url;
        },
    };
    let current_non_overlapping_filter = {
        id: -1,
        base_url: "http://localhost:8080/api/shifts/nonoverlapping",
        GetAvailableUsersURL: function () {
            let url = this.base_url + "/" + this.id + "/users";
            let params = ["current_user_id=" + current_user_id];
            url = url + "?" + params.join("&");
            return url;
        },
    };
    let shifts = [];
    let summaries = [];
    let current_shift_detail;

    function parseDateToURLParam(date) {
        return encodeURI((date.getMonth() + 1) + '/' + date.getDate() + '/' + date.getFullYear());
    }

    let usersAvailableForShift = [];
    let app = new Framework7({
        ios: true,
        desktop: false,
        // App root element
        root: '#app',
        // App Name
        name: 'Time Demo',
        // App id
        id: 'com.myapp.test',
        // Enable swipe panel
        panel: {
            swipe: 'left',
        },
        // Add default routes
        routes: [
            // This is the view displayed when the website launches. Since I'm not building in any authentication, you can simply selecr a user.
            {
                path: '/homeView/',
                async: function (routeTo, routeFrom, resolve, reject) {
                    app.request.json("http://localhost:8080/api/users?current_user_id=1&order= name", function (data) {
                        if (data.success) {
                            resolve({
                                    template: homeView
                                },
                                {
                                    context: data
                                });
                        } else {
                            reject();
                        }
                    });
                },
            },
            // The App view actually gives the user some information, displaying shifts and summaries of hours worked on two sepreate tabs.
            {
                path: '/appView/',
                async: function (routeTo, routeFrom, resolve, reject) {
                    shifts = [];
                    summaries = [];
                    app.request.json(current_shifts_filter.GetShiftURL(), function (shiftdata) {
                        if (shiftdata.success) {
                            shifts = shiftdata.results;
                            app.request.json(current_summary_filter.GetSummariesURL(), function (data) {
                                if (data.success) {
                                    summaries = data.results;
                                    resolve({
                                            template: appView
                                        },
                                        {
                                            context: {
                                                current_user_name: current_user_name,
                                                is_manager: current_user_is_manager,
                                                shifts: shifts,
                                                summaries: summaries,
                                                shift_message: current_shifts_filter.message,
                                                summary_message: current_summary_filter.message
                                            }
                                        });
                                } else {
                                    app.dialog.alert(data.message);
                                    reject();
                                }
                            });
                        } else {
                            app.dialog.alert(shiftdata.message);
                            reject();
                        }
                    });
                },
            },
            // This view just alters the current shifts filter object.
            {
                path: '/shiftsFiltersView/',
                async: function (routeTo, routeFrom, resolve, reject) {
                    resolve({
                            template: shiftsFiltersView
                        },
                        {
                            context: {
                                current_user_name: current_user_name,
                                is_manager: current_user_is_manager,
                            }
                        });
                },
                on: {
                    pageBeforeIn: function (e, page) {
                        let calendarRange = app.calendar.create({
                            inputEl: '#shiftDateRange',
                            dateFormat: 'M dd yyyy',
                            rangePicker: true,
                            closeOnSelect: true,
                            value: [
                                current_shifts_filter.date_from,
                                current_shifts_filter.date_to
                            ]
                        });
                        $("#showOnlyMyShifts")[0].checked = current_shifts_filter.show_only_my_shifts;
                    }
                }
            },
            // This view just alters the current summaries filter object.
            {
                path: '/summariesFiltersView/',
                async: function (routeTo, routeFrom, resolve, reject) {
                    resolve({
                            template: summariesFiltersView
                        },
                        {
                            context: {
                                current_user_name: current_user_name,
                                is_manager: current_user_is_manager,
                            }
                        });
                },
                on: {
                    pageBeforeIn: function (e, page) {
                        let calendarRange = app.calendar.create({
                            inputEl: '#summaryDateRange',
                            dateFormat: 'M dd yyyy',
                            rangePicker: true,
                            closeOnSelect: true,
                            value: [
                                current_summary_filter.date_from,
                                current_summary_filter.date_to
                            ]
                        });
                    }
                }
            },
            // Shows detailed information about a single shift. Allows the employee to be changed if the current user is a manager.
            {
                path: '/shiftDetailsView/',
                async: function (routeTo, routeFrom, resolve, reject) {
                    shifts = [];
                    summaries = [];
                    app.request.json(current_overlapping_filter.GetOverlappingURL(), function (data) {
                        if (data.success) {
                            current_shift_detail = data.results;
                            resolve({
                                    template: shiftDetailsView
                                },
                                {
                                    context: {
                                        current_user_name: current_user_name,
                                        is_manager: current_user_is_manager,
                                        detail: data.results,
                                        shifts: data.results.shifts
                                    }
                                });
                        } else {
                            app.dialog.alert(data.message);
                            reject();
                        }
                    });
                },
            },
            // View for changing the employee that is assigned to a single shift.
            {
                path: '/changeEmployeeView/',
                async: function (routeTo, routeFrom, resolve, reject) {
                    shifts = [];
                    summaries = [];
                    app.request.json(current_non_overlapping_filter.GetAvailableUsersURL(), function (data) {
                        if (data.success) {
                            data.results.users_available.push({
                                name: "Unassigned",
                                id: -1
                            });

                            resolve({
                                    template: changeEmployeeView
                                },
                                {
                                    context: {
                                        current_user_name: current_user_name,
                                        is_manager: current_user_is_manager,
                                        users: data.results.users_available
                                    }
                                });
                        } else {
                            app.dialog.alert(data.message);
                            reject();
                        }
                    });
                },
            },
            // View for creating new shifts.
            {
                path: '/createShiftView/',
                async: function (routeTo, routeFrom, resolve, reject) {
                    shifts = [];
                    summaries = [];
                    app.request.json("http://localhost:8080/api/users?current_user_id=" + current_user_id + "&page_size=1000", function (data) {
                        if (data.success) {
                            data.results.push({
                                name: "Unassigned",
                                id: -1
                            });
                            usersAvailableForShift = data.results;
                            resolve({
                                    template: createShiftView
                                },
                                {
                                    context: {
                                        current_user_name: current_user_name,
                                        is_manager: current_user_is_manager,
                                    }
                                });

                        } else {
                            app.dialog.alert(data.message);
                            reject();
                        }
                    });


                },
                on: {
                    pageBeforeIn: function (e, page) {
                        let oAP1, oAP2;
                        let dStartD, dEndD, sStartD, sEndD;
                        dStartD = new Date();
                        dEndD = new Date(dStartD.getTime() + (8 * $.AnyPicker.extra.iMS.h));
                        // This will automatically set the time selectors to the current date and time.
                        $("#ip-start-date").AnyPicker(
                        {
                            mode: "datetime",
                            theme: "ios",
                            inputDateTimeFormat: "MM/dd/yyyy hh:mm AA",
                            dateTimeFormat: "MMM dd,yyyy hh:mm AA",
                            onInit: function()
                            {
                                oAP1 = this;
                                sEndD = oAP1.formatOutputDates(dEndD, "MM dd yyyy hh:mm AA");
                                oAP1.setMaximumDate(sEndD); //The start time cannot be greater than the end time.
                                oAP1.setSelectedDate(dStartD);
                            },
                            onSetOutput: function(sOutput, oSelectedValues)
                            {
                                sStartD = sOutput;
                                oAP2.setMinimumDate(sStartD); //The end time cannot be greater than the end time.
                                oAP2.setSelectedDate(sStartD);
                            }
                        });

                        $("#ip-end-date").AnyPicker(
                        {
                            mode: "datetime",
                            theme: "ios",
                            inputDateTimeFormat: "MM/dd/yyyy hh:mm AA",
                            dateTimeFormat: "MMM dd,yyyy hh:mm AA",
                            onInit: function()
                            {
                                oAP2 = this;
                                sStartD = oAP2.formatOutputDates(dStartD);
                                oAP2.setMinimumDate(sStartD); // Make sure this time is not less than the start time.
                                oAP2.setSelectedDate(dEndD);
                            },
                            onSetOutput: function(sOutput, oSelectedValues)
                            {
                                sEndD = sOutput;
                                oAP1.setMaximumDate(sEndD); // Make sure the start time is less than this time
                            }
                        });


                        // This will get a list of users and their respective IDs for submitting to the API.
                        let name_ids = [];
                        let names = [];
                        for (let i = 0; i < usersAvailableForShift.length; i++) {
                            name_ids[i] = usersAvailableForShift[i].id;
                            names[i] = usersAvailableForShift[i].name;
                        }

                        // This will only list users with the manager role.
                        let manager_ids = [];
                        let managers = [];
                        for (let i = 0; i < usersAvailableForShift.length; i++) {
                            if (usersAvailableForShift[i].role == "manager") {
                                manager_ids.push(usersAvailableForShift[i].id);
                                managers.push(usersAvailableForShift[i].name);
                            }
                        }

                        let pickerUser = app.picker.create({
                            inputEl: '#create-shift-user',
                            rotateEffect: true,
                            formatValue: function (values, displayValues) {
                                return displayValues[0];
                            },
                            cols: [
                                {
                                    textAlign: 'center',
                                    values: name_ids,
                                    displayValues: names,
                                },
                            ],
                            on: {
                                change: function (picker, values, displayValues) {

                                },
                                close: function (picker) {
                                    $("#create-shift-user").attr("user-id", picker.value[0]);
                                }
                            }
                        });

                        let pickerManager = app.picker.create({
                            inputEl: '#create-shift-manager',
                            rotateEffect: true,
                            formatValue: function (values, displayValues) {
                                return displayValues[0];
                            },
                            cols: [
                                {
                                    textAlign: 'center',
                                    values: manager_ids,
                                    displayValues: managers,
                                },
                            ],
                            on: {
                                change: function (picker, values, displayValues) {

                                },
                                close: function (picker) {
                                    $("#create-shift-manager").attr("user-id", picker.value[0]);
                                }
                            }
                        });
                    }
                }
            },
            // View for editing the start and end time of shifts.
            {
                path: '/editShiftTimeView/',
                async: function (routeTo, routeFrom, resolve, reject) {
                    resolve({
                        template: editShiftTimeView
                    },
                    {
                        context: {
                            current_user_name: current_user_name,
                            is_manager: current_user_is_manager,
                        }
                    });
                },
                on: {
                    pageBeforeIn: function (e, page) {
                        let oAP1, oAP2;
                        let dStartD, dEndD, sStartD, sEndD;
                        dStartD = new Date(current_shift_detail.start_time);
                        dEndD = new Date(current_shift_detail.end_time);
                        $("#ip-start-date").AnyPicker(
                        {
                            mode: "datetime",
                            theme: "ios",
                            inputDateTimeFormat: "MM/dd/yyyy hh:mm AA",
                            dateTimeFormat: "MMM dd,yyyy hh:mm AA",
                            onInit: function()
                            {
                                oAP1 = this;
                                sEndD = oAP1.formatOutputDates(dEndD, "MM dd yyyy hh:mm AA");
                                oAP1.setMaximumDate(sEndD); //The start time cannot be greater than the end time.
                                oAP1.setSelectedDate(dStartD);
                            },
                            onSetOutput: function(sOutput, oSelectedValues)
                            {
                                sStartD = sOutput;
                                oAP2.setMinimumDate(sStartD); //The end time cannot be greater than the end time.
                                oAP2.setSelectedDate(sStartD);
                            }
                        });
    
                        $("#ip-end-date").AnyPicker(
                        {
                            mode: "datetime",
                            theme: "ios",
                            inputDateTimeFormat: "MM/dd/yyyy hh:mm AA",
                            dateTimeFormat: "MMM dd,yyyy hh:mm AA",
                            onInit: function()
                            {
                                oAP2 = this;
                                sStartD = oAP2.formatOutputDates(dStartD);
                                oAP2.setMinimumDate(sStartD); // Make sure this time is not less than the start time.
                                oAP2.setSelectedDate(dEndD);
                            },
                            onSetOutput: function(sOutput, oSelectedValues)
                            {
                                sEndD = sOutput;
                                oAP1.setMaximumDate(sEndD); // Make sure the start time is less than this time
                            }
                        });

                        let name_ids = [];
                        let names = [];
                        for (let i = 0; i < usersAvailableForShift.length; i++) {
                            name_ids[i] = usersAvailableForShift[i].id;
                            names[i] = usersAvailableForShift[i].name;
                        }

                        let manager_ids = [];
                        let managers = [];
                        for (let i = 0; i < usersAvailableForShift.length; i++) {
                            if (usersAvailableForShift[i].role == "manager") {
                                manager_ids.push(usersAvailableForShift[i].id);
                                managers.push(usersAvailableForShift[i].name);
                            }
                        }

                        let pickerUser = app.picker.create({
                            inputEl: '#create-shift-user',
                            rotateEffect: true,
                            formatValue: function (values, displayValues) {
                                return displayValues[0];
                            },
                            cols: [
                                {
                                    textAlign: 'center',
                                    values: name_ids,
                                    displayValues: names,
                                },
                            ],
                            on: {
                                change: function (picker, values, displayValues) {

                                },
                                close: function (picker) {
                                    $("#create-shift-user").attr("user-id", picker.value[0]);
                                }
                            }
                        });

                        let pickerManager = app.picker.create({
                            inputEl: '#create-shift-manager',
                            rotateEffect: true,
                            formatValue: function (values, displayValues) {
                                return displayValues[0];
                            },
                            cols: [
                                {
                                    textAlign: 'center',
                                    values: manager_ids,
                                    displayValues: managers,
                                },
                            ],
                            on: {
                                change: function (picker, values, displayValues) {

                                },
                                close: function (picker) {
                                    $("#create-shift-manager").attr("user-id", picker.value[0]);
                                }
                            }
                        });
                    }
                }
            },
        ],
        // ... other parameters
    });
    // Once all the views have been created, set the view to the home view landing page.
    app.router.navigate("/homeView/", {
        animate: false
    });



    // Basic UI event handling
    $(document).on("click", ".login-select", function () {
        current_user_id = parseInt($(this).attr("user-id"));
        current_user_name = $(this).attr("user-name");
        current_user_is_manager = $(this).attr("user-role") == "manager";
        current_shifts_filter.Reset();
        current_summary_filter.Reset();
        app.router.navigate("/appView/");
    });

    $(document).on("click", ".filter-shifts", function () {
        app.router.navigate("/shiftsFiltersView/");
    });

    $(document).on("click", ".filter-summaries", function () {
        app.router.navigate("/summariesFiltersView/");
    });

    $(document).on("click", ".shift-link", function () {
        id = $(this).attr("shift-id");
        current_overlapping_filter.id = parseInt(id);
        current_non_overlapping_filter.id = current_overlapping_filter.id;
        app.router.navigate("/shiftDetailsView/");
    });

    $(document).on("click", "#submitShiftFilter", function () {
        current_shifts_filter.show_only_my_shifts = $("#showOnlyMyShifts")[0].checked;
        let shiftDateRange = $("#shiftDateRange").val();
        if (shiftDateRange != "") {
            let date_1 = new Date(shiftDateRange.split(" - ")[0]);
            let date_2 = new Date(shiftDateRange.split(" - ")[1]);
            if (date_1.getTime() < date_2.getTime()) {
                current_shifts_filter.date_from = date_1;
                current_shifts_filter.date_to = date_2;
            } else {
                current_shifts_filter.date_from = date_2;
                current_shifts_filter.date_to = date_1;
            }
        }
        app.router.back("/appView/", {
            ignoreCache: true,
            force: true
        })
    });

    $(document).on("click", "#submitSummaryFilter", function () {
        let shiftDateRange = $("#summaryDateRange").val();
        if (shiftDateRange != "") {
            let date_1 = new Date(shiftDateRange.split(" - ")[0]);
            let date_2 = new Date(shiftDateRange.split(" - ")[1]);
            if (date_1.getTime() < date_2.getTime()) {
                current_summary_filter.date_from = date_1;
                current_summary_filter.date_to = date_2;
            } else {
                current_summary_filter.date_from = date_2;
                current_summary_filter.date_to = date_1;
            }
        }
        app.router.back("/appView/", {
            ignoreCache: true,
            force: true
        });
        setTimeout(function () {
            app.tab.show("#summary-tab", false);
        }, 100);
    });

    $(document).on("click", ".change-employee", function () {
        if (current_user_is_manager) {
            app.router.navigate("/changeEmployeeView/");
        }
    });

    $(document).on("click", "#submitEmployeeChange", function () {
        let selValue = $('input[name=employee-radio]:checked').val();
        if (selValue != null) {
            updateShiftEmployee(current_overlapping_filter.id, parseInt(selValue));
        }
    });

    $(document).on("click", "#createShift", function () {
        createShift();
    });

    $(document).on("click", "#editShiftTimes", function() {
       updateShiftTime(current_shift_detail.id, $("#ip-start-date").val(), $("#ip-end-date").val());
    });





    $(document).on("click", ".add-shift", function() {
        if (current_user_is_manager) {
            app.router.navigate("/createShiftView/");
        }
    });

    function updateShiftEmployee(shift_id, employee_id) {
        $.ajax({
            type: "PUT",
            url: "http://localhost:8080/api/shifts/" + shift_id + "?current_user_id=" + current_user_id,
            contentType: "application/json",
            data: JSON.stringify({
                employee_id: employee_id,
            }),
            fail: function(response) {
                app.dialog.alert(response.message, "Error!");
            },
            success: function (response) {
                app.router.navigate("/changeEmployeeView/", { animate: false });
                app.router.navigate("/shiftDetailsView/", {
                    animate: false,
                    ignoreCache: true,
                    force: true,
                    reloadCurrent: true,
                    reloadPrevious: true,
                    reloadAll: true
                });
                setTimeout(function() {
                    app.router.back("/shiftDetailsView/", {
                        animate: false,
                        ignoreCache: true,
                        force: true,
                        reloadCurrent: true,
                        reloadPrevious: true,
                        reloadAll: true
                    });
                }, 50);
            },
            error: function(response) {
                app.dialog.alert(response.responseJSON.message, "Error!");
            }
        });
    }

    function updateShiftTime(shift_id, start_time, end_time) {
        $.ajax({
            type: "PUT",
            url: "http://localhost:8080/api/shifts/" + shift_id + "?current_user_id=" + current_user_id,
            contentType: "application/json",
            data: JSON.stringify({
                start_time: start_time,
                end_time: end_time
            }),
            success: function (response) {
                app.router.navigate("/changeTimeView/", { animate: false });
                app.router.navigate("/shiftDetailsView/", {
                    animate: false,
                    ignoreCache: true,
                    force: true,
                    reloadCurrent: true,
                    reloadPrevious: true,
                    reloadAll: true
                });
                setTimeout(function() {
                    app.router.back("/shiftDetailsView/", {
                        animate: false,
                        ignoreCache: true,
                        force: true,
                        reloadCurrent: true,
                        reloadPrevious: true,
                        reloadAll: true
                    });
                }, 50);
            },
            error: function(response) {
                app.dialog.alert(response.responseJSON.message, "Error!");
            }
        });
    }

    function createShift(){
        let from_date = $("#ip-start-date").val();
        let to_date = $("#ip-end-date").val();
        let user_id = isNaN($("#create-shift-user").attr("user-id")) ? null : parseInt($("#create-shift-user").attr("user-id"));
        let manager_id = isNaN($("#create-shift-manager").attr("user-id")) ? null : parseInt($("#create-shift-manager").attr("user-id"));
        if (from_date.trim() == "") {
            app.dialog.alert("Error, start time cannot be blank!", "Error!");
            return;
        }
        if (to_date.trim() == "") {
            app.dialog.alert("Error, end time cannot be blank!", "Error!");
            return;
        }
        if (user_id == -1) {
            user_id = null;
        }
        $.ajax({
            type: "POST",
            url: "http://localhost:8080/api/shifts?current_user_id=" + current_user_id,
            contentType: "application/json",
            data: JSON.stringify({
                manager_id: manager_id,
                employee_id: user_id,
                start_time: from_date,
                end_time: to_date
            }),
            success: function(response) {
                app.router.back("/appView/", {
                    animate: false,
                    ignoreCache: true,
                    force: true,
                    reloadCurrent: true,
                    reloadPrevious: true,
                    reloadAll: true
                });
            },
            error: function(response) {
                app.dialog.alert(response.responseJSON.message, "Error!");
            }
        });
    }
})();
