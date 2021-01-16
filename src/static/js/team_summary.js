var app = new Vue({
    el: '#app',
    data: {
        cnt: 0,
        season: season,
        gw: gw,
        next_gw: next_gw,
        date: date,
        listdates: listdates,
        is_active: is_active,
        active_gw: active_gw,
        solutions: [],
        team_id: "-1",
        ownership_source: "Official FPL API",
        available_sources: ["Official FPL API"],
        sample_data: {},
        el_data: undefined,
        xp_data: undefined,
        rp_data: undefined,
        fixture_data: undefined,
        rp_ready: false,
        team_data: [],
        sorted_data: undefined,
        chosen_player: {},
        el_types: element_type,
        player_filter: "",
        first_init: true,
        swap_pair: { out: -1, in: -1 },
        transfer_squad_table: "",
        transfer_table: "",
        captaincy_enabled: false,
        overridden_values: undefined,
        edit_table_cache: undefined,
        edit_table: "",
        edit_table_ready: false,
        edit_overridden_buffer: undefined
    },
    created: function() {
        this.overridden_values = {};
    },
    methods: {
        refresh_results() {
            season = this.season;
            gw = this.gw;
            date = this.date;
            load_gw();
            load_team();
        },
        refresh_gw() {
            $("#gwModal").modal({
                backdrop: 'static',
                keyboard: false
            }).modal('show');
            call_gw_stats(this.gw.slice(2));
        },
        close_date() {
            $("#dateModal").modal('hide');
        },
        close_source_modal() {
            $("#sourceModal").modal('hide');
        },
        close_teammodal() {
            $("#teamModal").modal('hide');
        },
        setSolutions(values) {
            this.solutions = _.cloneDeep(values);
        },
        saveTeamId(e) {
            let self = this;
            this.team_id = $("#teamIdEnter").val();
            this.$nextTick(() => {
                self.close_teammodal();
                load_team();
            })
        },
        saveEl(values) {
            this.el_data = values;
        },
        saveXP(values) {
            this.xp_data = values;
        },
        saveTeamData(data) {
            this.team_data = data;
        },
        saveSampleData(success, data) {
            if (success) {
                this.sample_data = data;
                this.available_sources = ["Official FPL API", "Sample - Overall", "Sample - Top 1M", "Sample - Top 100K", "Sample - Top 10K", "Sample - Top 1K", "Sample - Top 100", "Sample - Ahead"];
            } else {
                this.sample_data = [];
                this.available_sources = ["Official FPL API"];
                this.ownership_source = this.available_sources[0];
            }
        },
        saveRPData(data) {
            this.rp_data = data;
        },
        saveFixtureData(data) {
            this.fixture_data = data;
        },
        generateList() {

            // PART 1: PRIOR DATA
            if (!this.is_ready) { return; }
            this.rp_ready = false;

            let pts = this.final_xp_data;
            let els = this.el_data;
            let team = this.team_data;
            let cgw = this.gw.slice(2);
            pts = pts.filter(x => x.event == cgw);
            els = Object.fromEntries(els.map(x => [x.id, x]));
            let captain = team.picks.filter(i => i.is_captain)[0].element;
            let lineup = team.picks.filter(i => i.multiplier >= 1).map(i => i.element);
            let squad = team.picks.map(i => i.element);
            let rp = this.final_rp_data;
            let ownership_vals = this.final_ownership_data;
            ownership_vals = Object.fromEntries(ownership_vals.map(x => [x.id, x]));

            pts.forEach((e) => {
                // e.info = els[e.player_id];
                e.element_type = els[e.player_id].element_type;
                e.price = parseFloat(els[e.player_id].now_cost) / 10;
                // e.ownership = els[e.player_id].selected_by_percent;
                if ('effective_ownership' in ownership_vals[e.player_id] && this.is_using_captain) {
                    e.ownership = ownership_vals[e.player_id].effective_ownership;
                } else {
                    e.ownership = ownership_vals[e.player_id].selected_by_percent;
                }
                e.lineup = lineup.includes(parseInt(e.player_id));
                e.squad = squad.includes(parseInt(e.player_id));
                e.captain = (e.player_id == captain);

                e.xp_owned = (1 - e.ownership / 100) * e.points_md;
                e.xp_non_owned = -e.ownership / 100 * e.points_md;
                if (this.is_using_captain) {
                    e.net_xp = ((e.lineup + e.captain) - e.ownership / 100) * parseFloat(e.points_md);
                } else {
                    e.net_xp = ((e.lineup == 1) - e.ownership / 100) * parseFloat(e.points_md);
                }

                if (this.is_using_captain) {
                    e.xp_owned_captain = ((e.captain + 1) - e.ownership / 100) * e.points_md;
                    e.net_xp_captain = ((e.captain + e.lineup) - e.ownership / 100) * e.points_md;
                } else {
                    e.xp_owned_captain = 0;
                    e.net_xp_captain = 0;
                }

                e.threat = false;
                e.stats = rp[e.player_id];

                if (this.rp_data !== undefined && this.rp_data.length > 0) {
                    e.rp = e.stats.total_points;
                    if (this.is_using_captain) {
                        e.net_gain = ((e.captain + 1 - parseFloat(e.ownership) / 100) * e.stats.total_points);
                    } else {
                        e.net_gain = ((1 - parseFloat(e.ownership) / 100) * e.stats.total_points);
                    }
                    e.net_loss = (-(parseFloat(e.ownership) / 100) * e.stats.total_points);
                    if (e.lineup) {
                        e.net_benefit = e.net_gain;
                    } else {
                        e.net_benefit = e.net_loss;
                    }
                } else {
                    e.rp = 0;
                    e.net_gain = 0;
                    e.net_loss = 0;
                    e.net_benefit = 0;
                }
            });
            let sorted_players = Object.entries(pts).sort((a, b) => {
                if (a[1].squad == b[1].squad) {
                    if (a[1].net_xp < b[1].net_xp)
                        return 1;
                    else
                        return -1;
                } else {
                    return (a[1].squad < b[1].squad) * 2 - 1;
                }
            });
            for (let i of sorted_players.slice(-5)) {
                i[1].threat = true;
            };
            this.sorted_data = sorted_players;

            // Posterior

            if (this.rp_data !== undefined && this.rp_data.length > 0) {
                this.rp_ready = true;
            }

        },
        setChosenPlayer(d) {
            this.chosen_player = d;
        },
        openSwapModel() {
            $("#ExpPlayerDetailModal").modal('hide');
            $("#playerModal").modal('show');
        },
        swapPlayers() {
            let old_player = $("#transfer_out").val();
            let new_player = this.chosen_player.player_id;
            this.team_data.picks.filter(i => i.element == parseInt(old_player))[0].element = parseInt(new_player);

            this.generateList();
            this.$nextTick(() => {
                $(".plot").empty();
                generate_plots();
            })
            $("#playerModal").modal('hide');
        },
        toggleLineupType(e) {
            let id = e.currentTarget.dataset.id;
            let el = this.team_data.picks.filter(i => i.element == parseInt(id))[0];
            if (el.multiplier == 0) {
                el.multiplier = 1;
            } else {
                el.multiplier = 0;
            }
            this.generateList();
        },
        chooseCaptain(e) {
            let id = e.currentTarget.dataset.id;
            let el = this.team_data.picks.filter(i => i.element == parseInt(id))[0];
            this.team_data.picks.forEach((e) => {
                e.is_captain = false;
            })
            el.is_captain = true;
            this.changeData();
        },
        refresh_plots() {
            $(".plot").empty();
            generate_plots();
        },
        loadOptimal() {
            let self = this;
            $.ajax({
                type: "GET",
                url: `data/${this.season}/${this.gw}/${this.date}/output/limited_best_15.csv`,
                dataType: "text",
                success: function(data) {
                    tablevals = data.split('\n').map(i => i.split(','));
                    keys = tablevals[0];
                    values = tablevals.slice(1);
                    values_filtered = values.filter(i => i.length > 1);
                    let squad = values_filtered.map(i => _.zipObject(keys, i));
                    self.team_data.picks.forEach(function load(val, index) {
                        val.element = parseInt(squad[index].player_id);
                        val.multiplier = index < 11 ? 1 : 0;
                        val.is_captain = squad[index].is_captain == "True";
                    })
                    self.generateList();
                    self.$nextTick(() => {
                        $(".plot").empty();
                        generate_plots();
                    })
                },
                error: function(xhr, status, error) {
                    console.log(xhr, status, error);
                }
            });
        },
        saveSquadToFile() {
            this.generateList();
            let squad_array = this.sorted_data.slice(0, 15).map(i => i[1].player_id + "," + i[1].web_name);
            downloadToFile(squad_array.join('\n'), 'squad.txt', 'text/plain');
        },
        loadSquadFromFile(event) {
            let self = this;
            if (event.target.files == undefined) {
                return;
            }
            let file = event.target.files[0]
            event.target.value = '';
            if (file.type == "text/plain") {
                const reader = new FileReader()
                reader.onload = function(event) {
                    let new_squad = event.target.result.split('\n').map(i => i.split(','));
                    if (new_squad.length != 15) { return; }
                    self.team_data.picks.forEach(function load(val, index) {
                        val.element = parseInt(new_squad[index][0]);
                        val.multiplier = index < 11 ? 1 : 0;
                    });
                    self.generateList();
                    self.$nextTick(() => {
                        $(".plot").empty();
                        generate_plots();
                    });
                };
                reader.onerror = error => reject(error);
                reader.readAsText(file);
            }
            console.log(event.target.files);
        },
        initTransferTable() {
            this.transfer_table = $("#all_players_table").DataTable({
                "order": [],
                "lengthChange": false,
                "pageLength": window.screen.width <= 768 ? 5 : 15,
                columnDefs: [
                    { orderable: false, targets: 0 },
                    { orderable: false, targets: 5 }
                ],
            });
            this.transfer_squad_table = $("#transfer_squad_table").DataTable({
                "order": [],
                "lengthChange": false,
                "pageLength": 15,
                paging: false,
                "info": false,
                columnDefs: [
                    { orderable: false, targets: 0, searchable: true },
                    { orderable: false, targets: 5 }
                ],
                dom: "ltip"
            });
        },
        clearTransferModal() {
            if (this.transfer_table !== "") {
                this.transfer_table.destroy();
                this.transfer_table = "";
                this.transfer_squad_table.destroy();
                this.transfer_squad_table = "";
            }
        },
        openTransfer() {
            let self = this;
            this.clearTransferModal();
            this.generateList();
            this.$nextTick(() => {
                self.$forceUpdate();
                setTimeout(() => {
                    self.initTransferTable();
                    $("#transferModal").modal("show");
                }, 100);
            });
        },
        markForTransferIn(event) {
            let id = event.currentTarget.dataset.id;
            let pos = event.currentTarget.dataset.pos;

            if (this.swap_pair.in == id) { // toggle
                this.swap_pair.in = -1;
                this.transfer_squad_table.columns().search('').draw();
                return;
            }

            this.swap_pair.in = id;
            if (this.swap_pair.out !== -1) {
                this.swapSelected();
            } else {
                this.transfer_squad_table.columns(0).search(pos).draw();
            }

        },
        markForTransferOut(event) {
            let id = event.currentTarget.dataset.id;
            let pos = event.currentTarget.dataset.pos;

            if (this.swap_pair.out == id) { // toggle
                this.swap_pair.out = -1;
                this.transfer_table.columns().search('').draw();
                return;
            }

            this.swap_pair.out = id;
            if (this.swap_pair.in !== -1) {
                this.swapSelected();
            } else {
                this.transfer_table.columns(0).search(pos).draw();
            }
        },
        swapSelected() {
            let old_player = this.swap_pair.out;
            let new_player = this.swap_pair.in;
            let self = this;

            this.clearTransferModal();

            this.$nextTick(() => {

                self.team_data.picks.filter(i => i.element == parseInt(old_player))[0].element = parseInt(new_player);

                self.swap_pair.in = -1;
                self.swap_pair.out = -1;

                self.generateList();
                self.$nextTick(() => {
                    self.initTransferTable();
                    $(".plot").empty();
                    generate_plots();
                });
            });
        },
        changeData() {
            this.generateList();
            this.$nextTick(() => {
                $(".plot").empty();
                generate_plots();
            });
        },
        toggleCaptaincy() {
            this.captaincy_enabled = !this.captaincy_enabled;
            this.changeData();
        },
        clearOverridden() {
            app.overridden_values = {};
            this.changeData()
        },
        initEditTable() {
            this.edit_table = $("#customInputTable").DataTable({
                order: [],
                info: false,
                scrollX: "100%",
                lengthChange: false,
                pageLength: 10,
                ordering: false,
                autoWidth: true
            });
            setTimeout(() => {
                app.edit_table.columns.adjust();
            }, 50)
        },
        clearEditTable() {
            if (this.edit_table !== "") {
                this.edit_table.destroy();
                this.edit_table = "";
            }
        },
        startEditTable() {
            let self = this;
            this.edit_overridden_buffer = {};
            this.edit_table_ready = false;
            this.clearEditTable();
            this.changeData();
            setTimeout(() => {
                self.generateList();
                self.syncTable();
                self.$nextTick(() => {
                    self.$forceUpdate();
                    setTimeout(() => {
                        self.initEditTable();
                        $("#customInputModal").modal('show');
                        this.edit_table_ready = true;
                    }, 150);
                });
            }, 50)
        },
        overrideValue(target, type) {
            let pid = target.dataset.id;
            let val = target.value;
            if (pid in this.edit_overridden_buffer) {
                this.$set(this.edit_overridden_buffer[pid], type, val)
            } else {
                let newobj = {}
                newobj[type] = val;
                this.edit_overridden_buffer[pid] = {}
                this.$set(this.edit_overridden_buffer[pid], type, val)
            }
            this.cnt += 1
        },
        syncTable() {
            let vals = _.cloneDeep([...app.prior_data].sort((a, b) => b[1].points_md - a[1].points_md)).map(i => i[1])
            vals.forEach((w) => {
                w.points_md = parseFloat(w.points_md).toFixed(2)
                w.ownership = parseFloat(w.ownership).toFixed(2);
                // w.ownership = (w.ownership).toFixed(2);
            })
            Object.entries(this.edit_overridden_buffer).forEach((w) => {
                let match = vals.find(i => i.player_id == w[0])
                if (match) {
                    if (w[1].xp) { match.points_md = w[1].xp }
                    if (w[1].rp) { match.rp = w[1].rp }
                    if (w[1].ownership) {
                        match.ownership = (w[1].ownership).toFixed(2);
                        // match.ownership = (w[1].ownership).toFixed(2);
                    }
                }
            })
            this.edit_table_cache = vals
        },
        saveEdits() {
            const keys = Object.keys(this.edit_overridden_buffer)
            for (let i of keys) {
                if (!(i in this.overridden_values)) {
                    this.overridden_values[i] = {}
                }
                for (const [key, value] of Object.entries(this.edit_overridden_buffer[i])) {
                    this.overridden_values[i][key] = value;
                }
            }
            this.cnt += 1
            this.generateList()
            this.edit_overridden_buffer = {}
                // this.startEditTable();
        }
    },
    computed: {
        is_ready() {
            if (this.team_id == "-1") {
                return false;
            }
            if (this.team_data.length == 0) { return false; }
            return true;
        },
        is_using_sample: function() {
            if (this.ownership_source == "Official FPL API") {
                return false;
            }
            return true;
        },
        is_live_gw: function() {
            return this.gw.slice(2) == active_gw;
        },
        is_using_captain: function() {
            if (!this.is_using_sample) { return false; }
            return this.captaincy_enabled;
        },
        final_xp_data: function() {
            let x = this.cnt;
            let pts = _.cloneDeep(this.xp_data);
            pts = _.uniqBy(pts, function(p) { return p.player_id });
            let overriden_xp = Object.entries(this.overridden_values).filter(i => i[1].xp);
            overriden_xp.forEach((w) => {
                t = pts.find(e => e.player_id == w[0]);
                t.points_md = w[1].xp;
            })
            return pts;
        },
        final_rp_data: function() {
            let x = this.cnt;
            if (!this.rp_data) { return []; }
            if (this.rp_data.length == 0) { return []; }
            let rp_raw = _.cloneDeep(this.rp_data);
            let rp = Object.fromEntries(rp_raw);
            Object.entries(this.overridden_values).filter(i => i[1].rp).forEach((w) => { rp[w[0]].total_points = w[1].rp });
            return rp;
        },
        final_ownership_data: function() {
            let x = this.cnt;
            let ownership_data = _.cloneDeep(this.ownership_data);
            let overriden_vals = Object.entries(this.overridden_values).filter(i => i[1].ownership);
            overriden_vals.forEach((w) => {
                t = ownership_data.find(e => e.id == w[0]);
                t.selected_by_percent = w[1].ownership;
                t.effective_ownership = w[1].ownership;
            });
            return ownership_data;
        },
        ownership_data: function() {
            if (Object.keys(this.sample_data).length == 0) {
                return this.el_data;
            }
            // "Sample - Overall", "Sample - Top 1M", "Sample - Top 100K", "Sample - Top 10K", "Sample - Top 1K", "Sample - Top 100", "Sample - Ahead"
            let teams = [];
            switch (this.ownership_source) {
                case "Official FPL API":
                    return this.el_data;
                case "Sample - Overall":
                    teams = this.sample_data["Overall"].filter(i => i.team != undefined)
                    break;
                case "Sample - Top 1M":
                    teams = this.sample_data["1000000"].filter(i => i.team !== undefined);
                    break;
                case "Sample - Top 100K":
                    teams = this.sample_data["100000"].filter(i => i.team !== undefined);
                    break;
                case "Sample - Top 10K":
                    teams = this.sample_data["10000"].filter(i => i.team !== undefined);
                    break;
                case "Sample - Top 1K":
                    teams = this.sample_data["1000"].filter(i => i.team !== undefined);
                    break;
                case "Sample - Top 100":
                    teams = this.sample_data["100"].filter(i => i.team !== undefined);
                    break;
                case "Sample - Ahead":
                    teams = this.sample_data["Overall"].filter(i => i.team != undefined).filter(i => i.team.summary_overall_rank <= this.team_data.entry_history.overall_rank);
                    break;
                default:
                    break;
            }

            let el_copy = _.cloneDeep(this.el_data);
            let all_players = teams.map(i => i.data.picks).flat().filter(i => i.multiplier > 0).map(i => i.element);
            let captains = teams.map(i => i.data.picks).flat().filter(i => i.is_captain).map(i => i.element);
            el_copy.forEach((e) => {
                let cnt = all_players.filter(i => i.toString() == e.id).length;
                e.selected_by_percent = cnt / teams.length * 100;
                let captain_cnt = captains.filter(i => i.toString() == e.id).length;
                e.effective_ownership = (cnt + captain_cnt) / teams.length * 100;
            });
            return el_copy;

        },
        current_team_id: {
            get: function() {
                if (this.team_id == "-1") {
                    return "";
                }
                return this.team_id;
            },
            set: function(v) {}
        },
        valid_team_id: function() {
            if (this.team_id == "-1") {
                return "Click to enter";
            } else {
                return this.team_id;
            }
        },
        availableDataSources: function() {
            return this.available_sources;
        },
        seasongwdate: {
            get: function() {
                return this.season + " / " + this.gw + " / " + this.date;
            },
            set: function(value) {
                let v = value.split(' / ');
                this.season = v[0];
                this.gw = v[1];
                this.date = v[2];
                this.refresh_results();
            }
        },
        team_squad: function() {
            if (!this.is_ready) { return []; }
            return this.sorted_data.slice(0, 15);
        },
        all_except_squad: function() {
            if (!this.is_ready) { return []; }
            return this.sorted_data.slice(15).sort(function(a, b) { return b[1].points_md - a[1].points_md });
        },
        prior_data: {
            get: function() {
                if (!this.is_ready) {
                    return [];
                }
                return this.sorted_data;
            }
        },
        prior_data_lineup: function() {
            return this.prior_data.filter(j => j[1].lineup)
        },
        prior_data_bench: function() {
            return this.prior_data.filter(j => j[1].squad && !j[1].lineup)
        },
        prior_data_danger: function() {
            return this.prior_data.slice(-5).reverse()
        },
        prior_sorted_by_xp: function() {
            return [...this.prior_data].sort((a, b) => b[1].points_md - a[1].points_md)
        },
        lineup_xp_sum: function() {
            if (!this.is_ready) { return 0; }
            if (this.is_using_captain) {
                return this.prior_data.filter(j => j[1].lineup).map(j => j[1].xp_owned_captain).reduce((a, b) => a + b, 0).toFixed(2);
            } else {
                return this.prior_data.filter(j => j[1].lineup).map(j => j[1].xp_owned).reduce((a, b) => a + b, 0).toFixed(2);
            }
        },
        lineup_own_sum: function() {
            if (!this.is_ready) { return 0; }
            return this.prior_data.filter(j => j[1].lineup).map(j => parseFloat(j[1].ownership)).reduce((a, b) => a + b, 0).toFixed(2);
        },
        squad_xp_sum: function() {
            if (!this.is_ready) { return 0; }
            if (this.is_using_captain) {
                return this.prior_data.filter(j => j[1].squad).map(j => j[1].xp_owned_captain).reduce((a, b) => a + b, 0).toFixed(2);
            } else {
                return this.prior_data.filter(j => j[1].squad).map(j => j[1].xp_owned).reduce((a, b) => a + b, 0).toFixed(2);
            }
        },
        squad_own_sum: function() {
            if (!this.is_ready) { return 0; }
            return this.prior_data.filter(j => j[1].squad).map(j => parseFloat(j[1].ownership)).reduce((a, b) => a + b, 0).toFixed(2);
        },
        rest_xp_sum: function() {
            if (!this.is_ready) { return 0; }
            return this.prior_data.filter(j => j[1].lineup == false).map(j => j[1].xp_non_owned).reduce((a, b) => a + b, 0).toFixed(2);
        },
        net_change: function() {
            if (!this.is_ready) { return 0; }
            let lineup_xp = this.lineup_xp_sum;
            let other_xp = this.prior_data.filter(j => j[1].lineup == false).map(j => j[1].xp_non_owned).reduce((a, b) => a + b, 0);
            let net_change = parseFloat(lineup_xp) + parseFloat(other_xp);
            // let change = "" + net_change < 0 ? net_change.toFixed(2) : "+" + net_change.toFixed(2);
            return net_change;
        },
        aftermath: function() {
            if (!this.is_ready) { return {}; }
            // let games = this.fixture_data.filter(i => i.event == this.gw.slice(2));
            let games_with_id = Object.fromEntries(this.fixture_data.map(i => [parseInt(i.id), i]))
            let exp_gain = exp_loss = real_gain = real_loss = exp_gain_live = exp_loss_live = 0;
            let team_lineup = this.prior_data.filter(j => j[1].lineup);
            let team_lineup_live = this.prior_data.filter(j => j[1].lineup).filter(j => j[1].event_id !== "").filter(j => games_with_id[parseInt(j[1].event_id)].started);
            // let team_lineup_live = this.prior_data.filter(j => j[1].lineup).filter(j => games_with_id[parseInt(j[1].event_id)].started);
            let rest_players = this.prior_data.filter(j => !j[1].lineup);
            let rest_players_with_game = this.prior_data.filter(j => !j[1].lineup).filter(j => j[1].event_id !== "");
            let rest_players_live = this.prior_data.filter(j => !j[1].lineup).filter(j => j[1].event_id !== "").filter(j => games_with_id[parseInt(j[1].event_id)].started);
            //let rest_players_live = this.prior_data.filter(j => !j[1].lineup).filter(j => games_with_id[parseInt(j[1].event_id)].started);

            if (this.is_using_captain) {
                exp_gain = getSum(team_lineup.map(j => j[1].points_md * (1 + j[1].captain - j[1].ownership / 100)));
                exp_gain_live = getSum(team_lineup_live.map(j => j[1].points_md * (1 + j[1].captain - j[1].ownership / 100)));
                real_gain = getSum(team_lineup.map(j => j[1].stats.total_points * (1 + j[1].captain - j[1].ownership / 100)))
                exp_loss = getSum(rest_players.map(j => j[1].points_md * (j[1].ownership / 100)));
                exp_loss_live = getSum(rest_players_live.map(j => j[1].points_md * (j[1].ownership / 100)));
                real_loss = getSum(rest_players.map(j => j[1].stats.total_points * (j[1].ownership / 100)));

                played_own = getSum(team_lineup_live.map(i => 1 + i[1].captain)) + "/" + getSum(team_lineup.map(i => 1 + i[1].captain));
                played_nonown = rest_players_live.length + "/" + rest_players_with_game.length;
            } else {
                exp_gain = getSum(team_lineup.map(j => j[1].points_md * (1 - j[1].ownership / 100)));
                exp_gain_live = getSum(team_lineup_live.map(j => j[1].points_md * (1 - j[1].ownership / 100)));
                real_gain = getSum(team_lineup.map(j => j[1].stats.total_points * (1 - j[1].ownership / 100)));
                exp_loss = getSum(rest_players.map(j => j[1].points_md * (j[1].ownership / 100)));
                exp_loss_live = getSum(rest_players_live.map(j => j[1].points_md * (j[1].ownership / 100)));
                real_loss = getSum(rest_players.map(j => j[1].stats.total_points * (j[1].ownership / 100)));

                played_own = team_lineup_live.length + "/" + team_lineup.length;
                played_nonown = rest_players_live.length + "/" + rest_players_with_game.length;
            }
            return { exp_gain: exp_gain, exp_loss: exp_loss, real_gain: real_gain, real_loss: real_loss, exp_gain_live: exp_gain_live, exp_loss_live: exp_loss_live, played_own: played_own, played_nonown: played_nonown }
        },
        formation: function() {
            if (!this.is_ready) {
                return [
                    [], ""
                ];
            }
            let elcount = [];
            let squad = this.prior_data.slice(0, 15);
            Object.values(this.el_types).forEach(function(e) {
                let filtered = squad.filter(i => i[1].element_type == e.id && i[1].lineup);
                elcount.push(filtered.length);
            })
            return [elcount, "(" + elcount[0] + ") " + `${elcount[1]}-${elcount[2]}-${elcount[3]}`];
        },
        is_formation_valid: function() {
            if (!this.is_ready) { return true; }
            let lineup = this.prior_data.filter(i => i[1].lineup);
            let is_valid = true;
            if (lineup.length != 11) {
                return false;
            } else {
                Object.values(this.el_types).forEach(function(e) {
                    let pos_els = lineup.filter(i => i[1].element_type == e.id).length;
                    if (pos_els < e.min) {
                        is_valid = false;
                    }
                    if (pos_els > e.max) {
                        is_valid = false;
                    }
                })
            }
            return is_valid;
        },
        sorted_posterior: function() {
            if (!this.is_ready) { return {}; }
            let csquad = this.prior_data.filter(i => i[1].squad).map(i => i[1]);
            let rest = this.prior_data.filter(i => !i[1].squad).map(i => i[1]).sort((a, b) => a.net_benefit - b.net_benefit);
            return { squad: csquad, rest: rest };
        },
        chosen_player_xp: {
            get: function() {
                let pid = this.chosen_player.player_id;
                if (pid in this.overridden_values && this.overridden_values[pid].xp) {
                    return rounded(this.overridden_values[pid].xp);
                } else {
                    return rounded(this.chosen_player.points_md);
                }
            },
            set: function(v) {
                let pid = this.chosen_player.player_id;
                if (pid in this.overridden_values) {
                    this.$set(this.overridden_values[pid], 'xp', v)
                } else {
                    this.$set(this.overridden_values, pid, { 'xp': v })
                }
                this.cnt += 1;
            }
        },
        chosen_player_ownership: {
            get: function() {
                if (_.isEmpty(this.chosen_player)) { return "-" }
                let pid = this.chosen_player.player_id;
                if (pid in this.overridden_values && this.overridden_values[pid].ownership) {
                    return rounded(this.overridden_values[pid].ownership);
                } else {
                    let ownership_data = this.final_ownership_data;
                    let player = ownership_data.find(i => i.id == this.chosen_player.player_id)
                    if (player) {
                        if (this.is_using_captain) {
                            return rounded(val = player.effective_ownership, digits = 1)
                        } else {
                            return rounded(val = player.selected_by_percent, digits = 1)
                        }
                    } else { return "-" }
                }
            },
            set: function(v) {
                let pid = this.chosen_player.player_id;
                if (pid in this.overridden_values) {
                    this.$set(this.overridden_values[pid], 'ownership', v)
                } else {
                    this.$set(this.overridden_values, pid, { 'ownership': v })
                }
                this.cnt += 1;
            }
        },
        chosen_player_detail: function() {
            if (_.isEmpty(this.chosen_player)) { return {} }
            let pid = this.chosen_player.player_id;
            if (pid in this.overridden_values) {
                let xp = this.chosen_player_xp;
                let own = this.chosen_player_ownership;
                let rp = this.chosen_player_rp;
                let capt_multiplier = this.chosen_player.captain * this.is_using_captain
                return { xp_owned: xp * (capt_multiplier + 1 - own / 100), xp_non_owned: -xp * own / 100, rp_owned: rp * (capt_multiplier + 1 - own / 100), rp_non_owned: -rp * own / 100 }
            } else {
                let own = this.chosen_player_ownership
                let rp = this.chosen_player_rp
                let capt_multiplier = this.chosen_player.captain * this.is_using_captain
                return { xp_owned: this.chosen_player.xp_owned, xp_non_owned: this.chosen_player.xp_non_owned, rp_owned: rp * (capt_multiplier + 1 - own / 100), rp_non_owned: -rp * own / 100 }
            }
        },
        chosen_player_rp: {
            get: function() {
                let pid = this.chosen_player.player_id;
                if (pid in this.overridden_values && this.overridden_values[pid].rp) {
                    return rounded(this.overridden_values[pid].rp);
                } else {
                    let rp_vals = this.final_rp_data;
                    if (pid in rp_vals) { return rp_vals[pid].total_points } else { return 0 }
                }
            },
            set: function(v) {
                let pid = this.chosen_player.player_id;
                if (pid in this.overridden_values) {
                    this.$set(this.overridden_values[pid], 'rp', v)
                } else {
                    this.$set(this.overridden_values, pid, { 'rp': v })
                }
            }
        },
    }
})

function load_gw() {

    let season = app.season;
    let gw = app.gw;
    let date = app.date;

    $.ajax({
        type: "GET",
        url: `data/${season}/${gw}/${date}/input/element_gameweek.csv`,
        dataType: "text",
        success: function(data) {
            tablevals = data.split('\n').map(i => i.split(','));
            keys = tablevals[0];
            values = tablevals.slice(1);
            let xp_data = values.map(i => _.zipObject(keys, i));
            app.saveXP(xp_data);
        },
        error: function(xhr, status, error) {
            console.log(error);
            console.error(xhr, status, error);
        }
    });

    $.ajax({
        type: "GET",
        url: `data/${season}/${gw}/${date}/input/element.csv`,
        dataType: "text",
        success: function(data) {
            tablevals = data.split('\n').map(i => i.split(','));
            keys = tablevals[0];
            values = tablevals.slice(1);
            let el_data = values.map(i => _.zipObject(keys, i));
            app.saveEl(el_data);
        },
        error: function(xhr, status, error) {
            console.log(error);
            console.error(xhr, status, error);
        }
    });

    target_gw = parseInt((gw).slice(2));

    $.ajax({
        type: "GET",
        url: `sample/${target_gw}/fpl_sampled.json`,
        dataType: "json",
        success: function(data) {
            app.saveSampleData(true, data);
        },
        error: function() {
            console.log("Cannot get GW sample, trying last week")
            if (gw == next_gw) {
                target_gw = parseInt(gw.slice(2)) - 1;
            }
            $.ajax({
                type: "GET",
                url: `sample/${target_gw}/fpl_sampled.json`,
                dataType: "json",
                success: function(data) {
                    app.saveSampleData(true, data);
                },
                error: function() {
                    app.saveSampleData(false, [])
                }
            });
        }
    });



    // https://fantasy.premierleague.com/api/event/14/live/

    let gw_no = app.gw.slice(2);

    call_gw_stats(gw_no);
}

function call_gw_stats(gw_no) {
    $.ajax({
        type: "GET",
        url: `https://cors.alpscode.com/fantasy.premierleague.com/api/event/${gw_no}/live/`,
        contentType: 'text/plain',
        dataType: 'text',
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET',
            'X-Requested-With': 'XMLHttpRequest'
        },
        success: function(data) {
            let elemvals = JSON.parse(data);
            let rp_data = elemvals.elements.map(i => [i.id, i.stats])
            app.saveRPData(rp_data);
            app.generateList();
            $("#gwModal").modal('hide');
            app.$nextTick(() => {
                $(".plot").empty();
                generate_plots();
            })
        },
        error: function(xhr, status, error) {
            console.log(error);
            console.error(xhr, status, error);
            alert(`Cannot get GW ${gw_no} results.`);
        }
    });

    $.ajax({
        type: "GET",
        url: `https://cors.alpscode.com/fantasy.premierleague.com/api/fixtures/`,
        contentType: 'text/plain',
        dataType: 'text',
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET',
            'X-Requested-With': 'XMLHttpRequest'
        },
        success: function(data) {
            let fixtures = JSON.parse(data);
            app.saveFixtureData(fixtures);
            app.generateList();
            $("#gwModal").modal('hide');
            app.$nextTick(() => {
                $(".plot").empty();
                generate_plots();
            })
        },
        error: function(xhr, status, error) {
            console.log(error);
            console.error(xhr, status, error);
            alert(`Cannot get fixture data.`);
        }
    });
}


function load_team() {
    let gw = app.gw.slice(2);
    if (app.team_id == "-1") {
        return;
    }
    $("#waitModal").modal({
        backdrop: 'static',
        keyboard: false
    }).modal('show');
    $.ajax({
        type: "GET",
        url: `https://cors.alpscode.com/fantasy.premierleague.com/api/entry/${app.team_id}/event/${gw}/picks/`,
        contentType: 'text/plain',
        dataType: 'text',
        // responseType: 'application/json',
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET',
            'X-Requested-With': 'XMLHttpRequest'
        },
        success: function(data) {
            let teamvals = JSON.parse(data);
            app.saveTeamData(teamvals);
            $("#waitModal").modal('hide');
            app.generateList();
            app.$nextTick(() => {
                $(".plot").empty();
                generate_plots();
            })
        },
        error: function(xhr, status, error) {
            if (app.gw == next_gw) {
                gw = "" + (parseInt(gw) - 1);
                $.ajax({
                    type: "GET",
                    url: `https://cors.alpscode.com/fantasy.premierleague.com/api/entry/${app.team_id}/event/${gw}/picks/`,
                    contentType: 'text/plain',
                    dataType: 'text',
                    // responseType: 'application/json',
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    success: function(data) {
                        let teamvals = JSON.parse(data);
                        app.saveTeamData(teamvals);
                        $("#waitModal").modal('hide');
                        app.generateList();
                        app.$nextTick(() => {
                            $(".plot").empty();
                            generate_plots();
                        })
                    },
                    error: function(xhr, status, error) {
                        console.log(error);
                        console.error(xhr, status, error);
                        alert("Cannot get picks for given team ID and gameweek");
                        $("#waitModal").modal('hide');
                    }
                });
            } else {
                console.log(error);
                console.error(xhr, status, error);
                alert("Cannot get picks for given team ID and gameweek");
                $("#waitModal").modal('hide');
            }
        }
    });
}

function generate_plots() {
    if (!app.is_ready) { return; }
    // if (app.rp_data == 0) { return; }
    plot_bubble_xp_own_prior();
    plot_bubble_xp_own_posterior();
    if (app.first_init) {
        $('[data-toggle="tooltip"]').tooltip();
        app.first_init = false;
    }
}

function plot_bubble_xp_own_prior() {

    if (app.sorted_data.length == 0) {
        return;
    }

    let pfilter = app.player_filter;

    var margin = { top: 40, right: 30, bottom: 40, left: 45 },
        width = 500 - margin.left - margin.right,
        height = 500 - margin.top - margin.bottom;


    var svg = d3.select("#xp_own_prior").append("svg")
        // .attr("width", width + margin.left + margin.right)
        // .attr("height", height + margin.top + margin.bottom)
        .attr("viewBox", `0 0  ${(width + margin.left + margin.right)} ${(height + margin.top + margin.bottom)}`)
        .attr("class", "mx-auto d-block")
        .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    let x_high = Math.ceil(Math.max(...app.sorted_data.map(i => i[1].xp_owned)));
    let x_low = Math.floor(Math.min(...app.sorted_data.map(i => i[1].xp_owned)));
    let y_low = Math.ceil(Math.max(...app.sorted_data.map(i => i[1].xp_non_owned)));
    let y_high = Math.floor(Math.min(...app.sorted_data.map(i => i[1].xp_non_owned)));

    if (app.is_using_captain) {
        x_high = Math.ceil(Math.max(...app.sorted_data.map(i => i[1].xp_owned_captain)));
    }

    // Add X axis
    var x = d3.scaleLinear()
        .domain([x_low, x_high])
        .range([0, width]);
    svg.append("g")
        // .attr("transform", "translate(0," + height + ")")
        .attr("opacity", 1)
        .call(d3.axisBottom(x).ticks(x_high - x_low)
            .tickSize(height)
        )
        .call(g => g.selectAll(".tick:first-of-type line")
            .style("stroke", "#8e8e8e")
            .style("stroke-width", 2)
        )
        .call(g => g.selectAll(".tick:not(:first-of-type) line")
            .attr("stroke-opacity", 0.2)
            .attr("stroke-dasharray", "3,5"))
        .call(g => g.selectAll(".tick text").attr("dy", 11));

    // Add X axis label:
    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("x", width / 2)
        .attr("y", height + 35)
        .attr("font-size", "smaller")
        .text("Exp Gain");

    // Add Y axis
    var y = d3.scaleLinear()
        .domain([y_low, y_high])
        .range([height, 0]);
    svg.append("g")
        .attr("opacity", 1)
        .call(d3.axisRight(y)
            .ticks(y_low - y_high)
            .tickSize(width))
        .call(g => g.selectAll(".tick:first-of-type line")
            .style("stroke", "#8e8e8e")
            .style("stroke-width", 2)
        )
        .call(g => g.selectAll(".tick:not(:first-of-type) line")
            .attr("stroke-opacity", 0.2)
            .attr("stroke-dasharray", "3,5"))
        .call(g => g.selectAll(".tick text").attr("x", -15));

    // Add Y axis label:
    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", -30)
        .attr("font-size", "smaller")
        .text("Exp Loss");

    var z = d3.scaleLinear()
        .domain([0, 13])
        .range([0, 8]);

    svg.selectAll(".domain").attr("stroke-opacity", 0);

    // Tooltip
    var tooltip = d3.select("body")
        .append("div")
        .style("opacity", 0)
        .attr("class", "tooltip-p3")
        .style("position", "absolute")
        .style("background-color", "#343436")
        .style("color", "white")
        .style("border", "solid")
        .style("border-color", "#ffffff82")
        .style("border-width", "1px")
        .style("border-radius", "5px")
        .style("padding", "5px")
        .style("font-size", "small");

    // Mouse events
    var mouseover = function(d) {
        tooltip.style("opacity", 0.8)
        d3.select(this)
            .style("opacity", 1)
        app.chosen_player = d;
        drawLineForXP();
    }
    var mousemove = function(d) {
        name_color = "white";
        own_color = "white";
        threat_color = "white";
        if (d.squad == true) {
            name_color = own_color = "#6fcfd6";
        } else if (d.threat == true) {
            name_color = threat_color = "#de6363";
        }
        tooltip
            .html(`
                <div class="mx-auto d-block text-center" style="color: ${name_color}">${d.web_name}</div>
                <table class="table table-striped table-sm table-dark mb-0">
                    <tr><td class="text-right">xP</td><td>${parseFloat(d.points_md).toFixed(2)}</td></tr>
                    <tr><td class="text-right">Own.</td><td>${parseFloat(d.ownership).toFixed(1)}%</td></tr>
                    <tr><td class="text-right">Price</td><td>£${d.price}M</td></tr>
                    <tr><td class="text-right">Exp Gain</td><td style="color: ${own_color}">${getWithSign(d.xp_owned)}</td></tr>
                    <tr><td class="text-right">Exp Loss</td><td style="color: ${threat_color}">${getWithSign(d.xp_non_owned)}</td></tr>
                </table>
            `)
            .style("left", (d3.event.pageX + 15) + "px")
            .style("top", (d3.event.pageY + 15) + "px")
    }
    var mousemove_captain = function(d) {
        tooltip
            .html(`
                <div class="mx-auto d-block text-center" style="color: orange">${d.web_name} (Captain)</div>
                <table class="table table-striped table-sm table-dark mb-0">
                    <tr><td class="text-right">xP</td><td>${parseFloat(d.points_md).toFixed(2)}</td></tr>
                    <tr><td class="text-right">Own.</td><td>${parseFloat(d.ownership).toFixed(1)}%</td></tr>
                    <tr><td class="text-right">Price</td><td>£${d.price}M</td></tr>
                    <tr><td class="text-right">Net Gain</td><td style="color: orange">${getWithSign(d.xp_owned_captain)}</td></tr>
                    <tr><td class="text-right">Net Loss</td><td style="color: white">${getWithSign(d.xp_non_owned)}</td></tr>
                </table>
            `)
            .style("left", (d3.event.pageX + 15) + "px")
            .style("top", (d3.event.pageY + 15) + "px")
    }
    var mouseleave = function(d) {
        tooltip.style("opacity", 0)
        d3.select(this)
            .style("opacity", 0.5);
        tooltip.style("left", "0px")
            .style("top", "0px");
        $("svg #chosen_xp").remove();
    }

    var drawLineForXP = function() {
        let v = app.chosen_player_xp;
        svg.append('line')
            .attr('id', 'chosen_xp')
            .attr("pointer-events", "none")
            .attr('x1', x(0))
            .attr('y1', y(-v))
            .attr('x2', x(v))
            .attr('y2', y(0))
            .style('stroke', 'yellow')
            .style("stroke-dasharray", "2,4");
    }

    if (($("#ExpPlayerDetailModal").data('bs.modal') || {})._isShown) {
        drawLineForXP();
    }

    var playerclick = function(d) {
        app.setChosenPlayer(d);
        $("#ExpPlayerDetailModal").modal('show');
        setTimeout(drawLineForXP, 50);
    }

    // Guidelines
    if (app.is_using_captain) {
        lines = [5, 10, 25, 50, 100];
    } else {
        lines = [5, 10, 25, 50];
    }
    lines = lines.map(i => [i, function(d) {
        x_min = 0;
        y_min = 0;
        x_max = 0;
        y_max = 0;
        x_gap = 0;
        y_gap = 0;

        let x_bound = -x_high * d / (100 - d);
        let y_bound = y_high;
        if (x_bound > y_bound) {
            x_max = x_high;
            y_max = x_bound;
            x_gap = 5;
            y_gap = 0;
        } else {
            x_max = -y_high / d * (100 - d);
            y_max = y_bound;
            x_gap = 0;
            y_gap = -15;
        }

        x_bound = -x_low * d / (100 - d);
        y_bound = y_low;
        if (x_bound < y_bound) {
            x_min = x_low;
            y_min = x_bound;
        } else {
            x_min = -y_low / d * (100 - d);
            y_min = y_bound;
        }

        return { x: { 'min': x_min, 'max': x_max, 'gap': x_gap }, y: { 'min': y_min, 'max': y_max, 'gap': y_gap } };
    }(i)]);

    svg.append('g')
        .selectAll()
        .data(lines)
        .enter()
        .append('line')
        .attr("x1", function(d) { return x(d[1].x.min) })
        .attr("y1", function(d) { return y(d[1].y.min) })
        .attr("x2", function(d) { return x(d[1].x.max) })
        .attr("y2", function(d) { return y(d[1].y.max) })
        .style("stroke", "#91d3ff")
        .style("stroke-width", 1)
        .style("opacity", 0.5)
        .style("stroke-dasharray", "3,5");

    // Guidelines text
    let g_text = svg.append('g')
    g_text
        .selectAll()
        .data(lines)
        .enter()
        .append('text')
        .attr("x", function(d) { return x(d[1].x.max) + d[1].x.gap; })
        .attr("y", function(d) { return y(d[1].y.max) + d[1].y.gap; })
        .attr("text-anchor", "left")
        .attr("alignment-baseline", "middle")
        .attr("pointer-events", "none")
        .text(function(d) { return d[0] + "%" })
        .style("font-size", "x-small")
        .style("fill", "#87b4d2")
        .style("opacity", 0.9);

    g_text.append('text')
        .attr("x", x(x_high) + 5)
        .attr("y", y(y_high) - 5)
        .attr("text-anchor", "left")
        .attr("alignment-baseline", "middle")
        .attr("pointer-events", "none")
        .text("Own%")
        .style("font-size", "x-small")
        .style("fill", "#87b4d2")
        .style("opacity", 0.9);

    let copy = app.prior_data.slice(0, -5).map(i => i[1]);
    let dangerous = app.prior_data.slice(-5).map(i => i[1]);
    let your_squad = app.prior_data.filter(i => (i[1].squad == true)).map(i => i[1]);
    if (pfilter !== "") {
        const options = {
            isCaseSensitive: false,
            // includeScore: false,
            // shouldSort: true,
            // includeMatches: false,
            // findAllMatches: false,
            minMatchCharLength: 2,
            // location: 0,
            threshold: 0.3,
            distance: 10,
            useExtendedSearch: true,
            // ignoreLocation: true,
            // ignoreFieldNorm: false,
            keys: ['web_name']
        };
        let list_x = copy;
        const fuse = new Fuse(list_x, options);
        let filtered = fuse.search(pfilter);
        copy = filtered.map(i => i.item);

        list_x = dangerous;
        fuse2 = new Fuse(list_x, options);
        filtered = fuse2.search(pfilter);
        dangerous = filtered.map(i => i.item);

        list_x = your_squad;
        fuse3 = new Fuse(list_x, options);
        filtered = fuse3.search(pfilter);
        your_squad = filtered.map(i => i.item);
    }

    // All players
    svg.append('g')
        .selectAll()
        .data(copy.filter(i => (i.squad == false)))
        .enter()
        .append("circle")
        .attr("cx", function(d) { return x(d.xp_owned); })
        .attr("cy", function(d) { return y(d.xp_non_owned); })
        .attr("r", function(d) { return z(d.price); })
        .style("fill", "#616362")
        .style("opacity", "0.5")
        .style("cursor", "pointer")
        .attr("stroke", "#9e9e9e")
        .on("mouseover", mouseover)
        .on("mousemove", mousemove)
        .on("mouseleave", mouseleave)
        .on("click", playerclick);

    // Dangerous players
    svg.append('g')
        .selectAll()
        .data(dangerous)
        .enter()
        .append("circle")
        .attr("cx", function(d) { return x(d.xp_owned); })
        .attr("cy", function(d) { return y(d.xp_non_owned); })
        .attr("r", function(d) { return z(d.price); })
        .style("fill", "#e22f2f")
        .style("opacity", "0.5")
        .style("cursor", "pointer")
        .attr("stroke", "#fffe53")
        .on("mouseover", mouseover)
        .on("mousemove", mousemove)
        .on("mouseleave", mouseleave)
        .on("click", playerclick);

    // Squad
    svg.append('g')
        .selectAll()
        .data(your_squad)
        .enter()
        .append("circle")
        .attr("cx", function(d) { return x(d.xp_owned); })
        .attr("cy", function(d) { return y(d.xp_non_owned); })
        .attr("r", function(d) { return z(d.price); })
        .style("fill", "#6fcfd6")
        .style("opacity", "0.5")
        .style("cursor", "pointer")
        .attr("stroke", "#ffffff")
        .on("mouseover", mouseover)
        .on("mousemove", mousemove)
        .on("mouseleave", mouseleave)
        .on("click", playerclick);


    if (app.is_using_captain) {

        let captain = your_squad.filter(i => i.captain);

        svg.append('g')
            .selectAll()
            .data(captain)
            .enter()
            .append("circle")
            .attr("cx", function(d) { return x(d.xp_owned_captain); })
            .attr("cy", function(d) { return y(d.xp_non_owned); })
            .attr("r", function(d) { return z(d.price); })
            .style("fill", "#042235")
            .style("opacity", "0.5")
            .attr("stroke", "orange")
            .on("mouseover", mouseover)
            .on("mousemove", mousemove_captain)
            .on("mouseleave", mouseleave);

    }

    // risk color: e22f2f - stroke fffe53
    // own color: 6fcfd6 - stroke ffffff
}

function plot_bubble_xp_own_posterior() {

    if (app.sorted_data.length == 0) {
        return;
    }

    var margin = { top: 40, right: 30, bottom: 45, left: 45 },
        width = 500 - margin.left - margin.right,
        height = 500 - margin.top - margin.bottom;


    var svg = d3.select("#xp_own_posterior").append("svg")
        // .attr("width", width + margin.left + margin.right)
        // .attr("height", height + margin.top + margin.bottom)
        .attr("viewBox", `0 0  ${(width + margin.left + margin.right)} ${(height + margin.top + margin.bottom)}`)
        .attr("class", "mx-auto d-block")
        .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    let x_high = Math.ceil(Math.max(...app.sorted_data.map(i => i[1].net_gain)));
    let x_low = Math.floor(Math.min(...app.sorted_data.map(i => i[1].net_gain)));
    let y_low = Math.ceil(Math.max(...app.sorted_data.map(i => i[1].net_loss)));
    let y_high = Math.floor(Math.min(...app.sorted_data.map(i => i[1].net_loss)));

    // Add X axis
    var x = d3.scaleLinear()
        .domain([x_low, x_high])
        .range([0, width]);
    svg.append("g")
        // .attr("transform", "translate(0," + height + ")")
        .attr("opacity", 1)
        .call(d3.axisBottom(x).ticks(x_high - x_low)
            .tickSize(height))
        // .call(g => g.selectAll(".tick:not(:first-of-type) line")
        .call(g => g.selectAll(".tick line")
            .attr("stroke-opacity", 0.2)
            .attr("stroke-dasharray", "3,5"))
        .call(g => g.selectAll(".tick text").attr("dy", 11));

    // Add X axis label:
    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("x", width / 2)
        .attr("y", height + 40)
        .attr("font-size", "smaller")
        .text("Net Gain");

    // Add Y axis
    var y = d3.scaleLinear()
        .domain([y_low, y_high])
        .range([height, 0]);
    svg.append("g")
        .attr("opacity", 1)
        .call(d3.axisRight(y).ticks(y_low - y_high)
            .tickSize(width))
        // .call(g => g.selectAll(".tick:not(:first-of-type) line")
        .call(g => g.selectAll(".tick line")
            .attr("stroke-opacity", 0.2)
            .attr("stroke-dasharray", "3,5"))
        .call(g => g.selectAll(".tick text").attr("x", -15));

    // Add Y axis label:
    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", -30)
        .attr("font-size", "smaller")
        .text("Net Loss");

    var z = d3.scaleLinear()
        .domain([0, 13])
        .range([0, 8]);

    svg.selectAll(".domain").attr("stroke-opacity", 0);

    // Tooltip
    var tooltip = d3.select("body")
        .append("div")
        .style("opacity", 0)
        .attr("class", "tooltip-p2")
        .style("position", "absolute")
        .style("background-color", "#343436")
        .style("color", "white")
        .style("border", "solid")
        .style("border-color", "#ffffff82")
        .style("border-width", "1px")
        .style("border-radius", "5px")
        .style("padding", "5px")
        .style("font-size", "small");

    // Mouse events
    var mouseover = function(d) {
        app.setChosenPlayer(d);
        tooltip.style("opacity", 0.8)
        d3.select(this)
            .style("opacity", 1)
        drawLineForRP();
    }
    var mousemove = function(d) {
        name_color = "white";
        own_color = "white";
        threat_color = "#de6363";
        if (d.squad == true) {
            name_color = own_color = "#6fcfd6";
            threat_color = "white";
        }
        // else if (d.threat == true) {
        //     name_color = "#de6363";
        // }
        tooltip
            .html(`
                <div class="mx-auto d-block text-center" style="color: ${name_color}">${d.web_name}</div>
                <table class="table table-striped table-sm table-dark mb-0">
                    <tr><td class="text-right">xP</td><td>${parseFloat(d.points_md).toFixed(2)}</td></tr>
                    <tr><td class="text-right">rP</td><td>${parseInt(d.stats.total_points)}</td></tr>
                    <tr><td class="text-right">Mins</td><td>${d.stats.minutes}</td></tr>
                    <tr><td class="text-right">Own.</td><td>${parseFloat(d.ownership).toFixed(1)}%</td></tr>
                    <tr><td class="text-right">Price</td><td>£${d.price}M</td></tr>
                    <tr><td class="text-right">Net Gain</td><td style="color: ${own_color}">${getWithSign(d.net_gain)}</td></tr>
                    <tr><td class="text-right">Net Loss</td><td style="color: ${threat_color}">${getWithSign(d.net_loss)}</td></tr>
                </table>
            `)
            .style("left", (d3.event.pageX + 15) + "px")
            .style("top", (d3.event.pageY + 15) + "px")
    }
    var mouseleave = function(d) {
        tooltip.style("opacity", 0)
        d3.select(this)
            .style("opacity", 0.5);
        tooltip.style("left", "0px")
            .style("top", "0px");
        $("svg #chosen_xp").remove();
    }

    var drawLineForRP = function() {
        let v = app.chosen_player_rp;
        svg.append('line')
            .attr('id', 'chosen_xp')
            .attr("pointer-events", "none")
            .attr('x1', x(0))
            .attr('y1', y(-v))
            .attr('x2', x(v))
            .attr('y2', y(0))
            .style('stroke', 'yellow')
            .style("stroke-dasharray", "2,4");
    }

    if (($("#RealPlayerDetailModal").data('bs.modal') || {})._isShown) {
        drawLineForRP();
    }

    var playerclick = function(d) {
        app.setChosenPlayer(d);
        $("#RealPlayerDetailModal").modal('show');
        setTimeout(drawLineForRP, 50);
    }

    let axes = svg.append('g');
    axes.append('line')
        .attr("x1", x(0))
        .attr("x2", x(0))
        .attr("y1", y(y_low))
        .attr("y2", y(y_high))
        .style("stroke", "#8e8e8e")
        .style("stroke-width", 2);
    axes.append('line')
        .attr("x1", x(x_low))
        .attr("x2", x(x_high))
        .attr("y1", y(0))
        .attr("y2", y(0))
        .style("stroke", "#8e8e8e")
        .style("stroke-width", 2);

    lines = [5, 10, 25, 50];

    lines = lines.map(i => [i, function(d) {
        x_min = 0;
        y_min = 0;
        x_max = 0;
        y_max = 0;
        x_gap = 0;
        y_gap = 0;

        let x_bound = -x_high * d / (100 - d);
        let y_bound = y_high;
        if (x_bound > y_bound) {
            x_max = x_high;
            y_max = x_bound;
            x_gap = 5;
            y_gap = 0;
        } else {
            x_max = -y_high / d * (100 - d);
            y_max = y_bound;
            x_gap = 0;
            y_gap = -15;
        }

        x_bound = -x_low * d / (100 - d);
        y_bound = y_low;
        if (x_bound < y_bound) {
            x_min = x_low;
            y_min = x_bound;
        } else {
            x_min = -y_low / d * (100 - d);
            y_min = y_bound;
        }

        return { x: { 'min': x_min, 'max': x_max, 'gap': x_gap }, y: { 'min': y_min, 'max': y_max, 'gap': y_gap } };
    }(i)]);

    svg.append('g')
        .selectAll()
        .data(lines)
        .enter()
        .append('line')
        .attr("x1", function(d) { return x(d[1].x.min) })
        .attr("y1", function(d) { return y(d[1].y.min) })
        .attr("x2", function(d) { return x(d[1].x.max) })
        .attr("y2", function(d) { return y(d[1].y.max) })
        .style("stroke", "#91d3ff")
        .style("stroke-width", 1)
        .style("opacity", 0.5)
        .style("stroke-dasharray", "3,5");

    // Guidelines text
    let g_text = svg.append('g')
    g_text
        .selectAll()
        .data(lines)
        .enter()
        .append('text')
        .attr("x", function(d) { return x(d[1].x.max) + d[1].x.gap; })
        .attr("y", function(d) { return y(d[1].y.max) + d[1].y.gap; })
        .attr("text-anchor", "left")
        .attr("alignment-baseline", "middle")
        .attr("pointer-events", "none")
        .text(function(d) { return d[0] + "%" })
        .style("font-size", "x-small")
        .style("fill", "#87b4d2")
        .style("opacity", 0.9);


    g_text.append('text')
        .attr("x", x(x_high) + 5)
        .attr("y", y(y_high) - 5)
        .attr("text-anchor", "left")
        .attr("alignment-baseline", "middle")
        .attr("pointer-events", "none")
        .text("Own%")
        .style("font-size", "x-small")
        .style("fill", "#87b4d2")
        .style("opacity", 0.9);

    let csquad = app.sorted_posterior.squad; //app.prior_data.filter(i => i[1].squad);
    let remaining = app.sorted_posterior.rest; //app.prior_data.filter(i => !i[1].squad).map(i => i[1]).sort((a, b) => a.net_benefit - b.net_benefit);

    // All players
    svg.append('g')
        .selectAll()
        .data(remaining.slice(5))
        .enter()
        .append("circle")
        .attr("cx", function(d) { return x(d.net_gain); })
        .attr("cy", function(d) { return y(d.net_loss); })
        .attr("r", function(d) { return z(d.price); })
        .style("fill", "#616362")
        .style("opacity", "0.5")
        .attr("stroke", "#9e9e9e")
        .style("cursor", "pointer")
        .on("mouseover", mouseover)
        .on("mousemove", mousemove)
        .on("mouseleave", mouseleave)
        .on("click", playerclick);

    // Dangerous players
    svg.append('g')
        .selectAll()
        .data(remaining.slice(0, 5))
        .enter()
        .append("circle")
        .attr("cx", function(d) { return x(d.net_gain); })
        .attr("cy", function(d) { return y(d.net_loss); })
        .attr("r", function(d) { return z(d.price); })
        .style("fill", "#e22f2f")
        .style("opacity", "0.5")
        .attr("stroke", "#fffe53")
        .style("cursor", "pointer")
        .on("mouseover", mouseover)
        .on("mousemove", mousemove)
        .on("mouseleave", mouseleave)
        .on("click", playerclick);

    // Squad
    svg.append('g')
        .selectAll()
        .data(csquad.filter(i => (i.squad == true)))
        .enter()
        .append("circle")
        .attr("cx", function(d) { return x(d.net_gain); })
        .attr("cy", function(d) { return y(d.net_loss); })
        .attr("r", function(d) { return z(d.price); })
        .style("fill", "#6fcfd6")
        .style("opacity", "0.5")
        .attr("stroke", "#ffffff")
        .style("cursor", "pointer")
        .on("mouseover", mouseover)
        .on("mousemove", mousemove)
        .on("mouseleave", mouseleave)
        .on("click", playerclick);

}

$('#transferModal').on('hidden.bs.modal', function(e) {
    app.clearTransferModal();
})

$('#playerModal').on('hidden.bs.modal', function(e) {
    $("svg #chosen_xp").remove()
})

$('#ExpPlayerDetailModal').on('hidden.bs.modal', function(e) {
    $("svg #chosen_xp").remove()
})

$('#RealPlayerDetailModal').on('hidden.bs.modal', function(e) {
    $("svg #chosen_xp").remove()
})

$("#customInputModal").on('hidden.bs.modal', function(e) {
    app.changeData();
})

$(document).ready(function() {
    load_gw();
});