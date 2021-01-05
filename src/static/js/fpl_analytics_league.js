var app = new Vue({
    el: '#app',
    data: {
        is_ready: false,
        season: season,
        gw: gw,
        next_gw: next_gw,
        date: date,
        listdates: listdates,
        league_data: [],
        table: ""
    },
    methods: {
        get_table() {
            $.ajax({
                type: "GET",
                url: `data/${this.season}/${this.gw}/${this.date}/input/fpl_analytics_league.csv`,
                dataType: "text",
                success: function(data) {
                    debugger;
                    tablevals = data.split('\n').map(i => i.split(','));
                    keys = tablevals[0];
                    keys = keys.map(i => i.trim());
                    values = tablevals.slice(1);
                    let el_data = values.map(i => _.zipObject(keys, i));
                    el_data = el_data.filter(i => i.FPL !== undefined)
                    app.saveSampleDataAndInit(true, el_data);
                },
                error: function(xhr, status, error) {
                    console.log(error);
                    console.error(xhr, status, error);
                }
            });
        },
        saveSampleDataAndInit(success, data) {
            if (success) {
                this.league_data = data;
            }
            this.is_ready = true;
            this.$nextTick(() => {
                this.table = $("#fpl_analytics_table").DataTable({
                    "order": [4],
                    info: false,
                    scrollX: true,
                    paging: false,
                    scrollY: "400px",
                    scrollCollapse: true,
                    fixedColumns: true,
                    lengthChange: false,
                    "processing": true,
                    searching: false,
                    buttons: [
                        'copy', 'csv'
                    ],
                    columnDefs: [
                        { orderable: false, targets: 0 }
                    ],
                });
                this.table.buttons().container()
                    .appendTo('.col-md-6:eq(0)');
            })
        },
    },
    computed: {
        is_fully_ready() {
            return (this.table != "");
        }
    }
})

$(document).ready(function() {
    app.get_table();
});