
var app = new Vue({
    el: '#app',
    data: {
        sample_data: "test",
        data_ac: {source: 'ac', response_code: 0, data: ''},
        data_fo: {source: 'fo', response_code: 0, data: ''}
    },
    computed: {

    },
    methods: {
        test_ac() {
            let proxy = "https://cors.alpscode.com"
            $.ajax({
                type: "GET",
                url: `${proxy}/fantasy.premierleague.com/api/bootstrap-static/`,
                dataType: "json",
                async: true,
                success: data => {
                    app.data_ac.data = data["events"][0]
                },
                error: (e) => {
                    console.log("Cannot get FPL main data");
                    console.error(e)
                }
            });
        },
        test_fo() {
            let proxy = "https://cors.fploptimized.com"
            $.ajax({
                type: "GET",
                url: `${proxy}/fantasy.premierleague.com/api/bootstrap-static/`,
                dataType: "json",
                async: true,
                success: data => {
                    app.data_fo.data = data["events"][0]
                },
                error: (e) => {
                    console.log("Cannot get FPL main data");
                    console.error(e)
                }
            });
        }
    }
})


$(document).ready(() => {
    
})
