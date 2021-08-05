var app = new Vue({
    el: '#app',
    data: {
        this_gw: gw,
        elements: [],
        last_gw_elements: [],
        data_options: [
            { 'name': "Official FPL API" }
        ],
        data_choice: 0,
        sample_data: {},
        total_players: 1,
        custom_captaincy: {},
        first_shown: true
    },
    computed: {
        is_both_ready() {
            return !(_.isEmpty(this.elements) || _.isEmpty(this.last_gw_elements))
        },
        combined_elements() {
            if (!this.is_both_ready) { return []}
            let combined_data = _.cloneDeep(this.elements)
            let is_sample = false;
            let sample_data = [];
            let capt_rates = this.custom_captaincy;
            if (this.data_choice != 0 && !_.isEmpty(this.sample_data)) {
                is_sample = true;
                let sample_raw = get_ownership_by_type(this.data_options[this.data_choice].name, this.elements, this.sample_data, {})
                sample_data = Object.fromEntries(sample_raw.data.map(i=>[i.id, i]))
            }
            combined_data.forEach((e) => {
                let match = _.find(this.last_gw_elements, {id: String(e.id)})
                if (match == undefined) {
                    e.last_selected_by_percent = 0;
                    // e.trend = e.selected_by_percent;
                    e.trend = 100 * (parseInt(e.transfers_in_event) - parseInt(e.transfers_out_event)) / parseInt(this.total_players);
                    e.last_gw_final = 0;
                    e.future_gw_final = e.trend;
                }
                else {
                    let last_gw_own = match.selected_by_percent;
                    e.last_selected_by_percent = last_gw_own;
                    // e.trend = e.selected_by_percent - last_gw_own;
                    e.trend =  100 * (parseInt(e.transfers_in_event) - parseInt(e.transfers_out_event)) / parseInt(this.total_players);
                    if (is_sample) {
                        let sample_match = sample_data[e.id];
                        if (sample_match == undefined) {
                            e.last_gw_final = 0;
                            e.future_gw_final = Math.min(100, Math.max(e.trend, 0))
                        }
                        else {
                            e.last_gw_final = parseFloat(sample_match.selected_by_percent);
                            e.future_gw_final = Math.min(100, Math.max(e.last_gw_final + e.trend, 0))
                        }
                    }
                    else {
                        e.last_gw_final = match.selected_by_percent;
                        e.trend = e.selected_by_percent - e.last_gw_final;
                        e.future_gw_final = e.selected_by_percent;
                    }
                    
                }
                if (e.id in capt_rates) {
                    e.captaincy = parseFloat(capt_rates[e.id]);
                    e.future_gw_final = e.future_gw_final + e.captaincy;
                }
                else {
                    e.captaincy = 0;
                }
                
            })

            setTimeout(() => {
                $("#ownership_rates_table").DataTable().destroy();
                app.$nextTick(() => {
                    $("#ownership_rates_table").DataTable({
                        "order": [
                            [4, 'desc']
                        ],
                        "pageLength": 10,
                        columnDefs: [
                            { orderable: false, targets: [1,2] }
                        ],
                        buttons: [
                            'copy', 'csv'
                        ]
                    });
                    $("#ownership_rates_table").DataTable().buttons().container()
                        .appendTo('#button-box');
                    app.first_shown = false;
                });
            }, 100)
            return combined_data
        },
        most_transferred_in() {
            if (_.isEmpty(this.elements)) { return []}
            let sorted_list = _.sortBy(this.elements, [(o) => {return -o.transfers_in_event}, (o) => {return -o.transfers_in}]);
            return sorted_list.slice(0, 10)
        },
        most_transferred_out() {
            if (_.isEmpty(this.elements)) { return []}
            let sorted_list = _.sortBy(this.elements, [(o) => {return -o.transfers_out_event}, (o) => {return -o.transfers_out}]);
            return sorted_list.slice(0, 10)
        },
        is_using_sample() {
            return this.data_choice != 0
        },
        captaincy_ordered_list() {
            let ce = this.combined_elements;
            return _.sortBy(ce, [(o) => {return -parseFloat(o.selected_by_percent)}, (o) => {return -parseFloat(o.ep_next)}])
        }
    },
    methods: {
        saveMainData(data) {
            this.total_players = data.total_players
            this.elements = data.elements
        },
        saveLastGWData(data) {
            this.last_gw_elements = data;
        },
        saveSampleData(success, data) {
            if (success) {
                this.sample_data = data
                this.data_options = [
                    { 'name': "Official FPL API" },
                    { 'name': "Sample - Overall" },
                    { 'name': "Sample - Top 1M" },
                    { 'name': "Sample - Top 100K" },
                    { 'name': "Sample - Top 10K" },
                    { 'name': "Sample - Top 1K" },
                    { 'name': "Sample - Top 100" }
                ]
                this.data_choice = 1
            }
        },
        invalidate_cache() {
            this.$nextTick(() => {
                // var table = $("#main_fixture").DataTable();
                // table.cells("td").invalidate().draw();
                // var table = $("#edit_fixture").DataTable();
                // table.cells("td").invalidate().draw();
            })
        },
        editCaptaincy(e) {
            let id = e.target.dataset.id;
            let value = e.target.value;
            this.$set(this.custom_captaincy, id, value)
        },
        resetCaptaincy() {
            this.custom_captaincy = {};
        },
        updateValues() {

        }
    }
});

async function fetch_fpl_main() {
    return get_fpl_main_data().then((data) => {
        app.saveMainData(data);
    }).catch((e) => {
        console.log("Error", e)
    })
}

async function fetch_last_gw_data() {
    let v = listdates[0].split(' / ')
    console.log(v)
    return get_cached_element_data({season: v[0].trim(), gw: v[1].trim(), date: v[2].trim()}).then((data) => {
        app.saveLastGWData(data);
    }).catch((e) => {
        console.log("Error", e)
    })
}

async function load_sample_data() {
    let v = listdates[0].split(' / ')
    return get_sample_data(v[0].trim(), v[1].slice(2))
        .then((data) => {
            app.saveSampleData(true, data);
        })
        .catch(error => {
            // Delete sample data and force official FPL API values
            app.saveSampleData(false, []);
        });
}

$(document).ready(() => {
    Promise.all([
            fetch_last_gw_data(),
            fetch_fpl_main(),
            load_sample_data()
        ]).then((values) => {
            app.$nextTick(() => {
                console.log('READY!')
            })
        })
        .catch((error) => {
            console.error("An error has occured: " + error);
        });
    $('#captaincyModal').on('shown.bs.modal', function(e) {
        $("#captainTable").DataTable().destroy()
        app.$nextTick(() => {
            $("#captainTable").DataTable({
                "order": [],
                "pageLength": 10,
                "info": false
            })
        })
    })
})