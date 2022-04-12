var app = new Vue({
    el: '#app',
    data: {
        raw_data: [],
        last_loaded: []
    },
    computed: {
        is_ready() {
            return !_.isEmpty(this.local_data)
        },
        parsed_data() {
            let d = this.raw_data
            return d.map(i => {return {...i, parsed: jQuery.csv.toObjects(i.data)}})
        },
        reverse_parsed_data() {
            return _.reverse(this.parsed_data)
        },
        sorted_local_data() {
            return []
        }
    },
    methods: {
        saveLocal() {
            window.localStorage.setItem('xp_storage', JSON.stringify(this.raw_data))
        },
        addData(raw_data, parsed_data, meta_data) {
            // disable same GW old ones
            this.raw_data.filter(i => i.meta.start_gw == meta_data.start_gw).forEach((e) => {
                e.meta.status = 'ready'
            })

            meta_data.status = 'active'
            this.raw_data.push({meta: meta_data, data: raw_data})
            
            this.saveLocal()
        },
        activateData(id) {
            let this_data = this.raw_data.find(i => i.meta.id == id)
            let other_active = this.raw_data.filter(i => (i.meta.start_gw == this_data.meta.start_gw) && (i.meta.status == 'active'))
            other_active.forEach((o) => {
                o.meta.status = 'ready'
            })

            this_data.meta.status = 'active'

            this.saveLocal()
        },
        deleteData(id) {
            let this_data = this.raw_data.find(i => i.meta.id == id)
            if(this_data) {
                let gw = this_data.meta.start_gw
                this.raw_data = this.raw_data.filter(i => i.meta.id !== id)
                let new_active = this.raw_data.find(i => i.meta.start_gw == gw)
                if (new_active) {
                    new_active.meta.status = 'active'
                }
            }
            
            this.saveLocal()
        },
        addNameToData() {
            if (_.isEmpty(this.last_loaded)) { return }
            let targets = this.raw_data.filter(i => this.last_loaded.includes(i.meta.id))
            let new_name = $("#data-name-entry").val()
            if (!_.isEmpty(new_name)) {
                targets.forEach((e) => {
                    e.meta.filename = new_name
                })
            }

            this.saveLocal()
        },
        renameData(id) {
            this.last_loaded = [id]
            $("#name-modal").modal('show')
        }
    }
});

function getRandomId() {
    return Math.random().toString(36).replace('0.', '')
}

function handleFiles(files) {
    app.last_loaded = [];
    ([...files]).forEach((f) => {
        let reader = new FileReader();
        reader.addEventListener('load', function (e) {
            let csvdata = e.target.result;
            let obj_data = jQuery.csv.toObjects(csvdata);

            // check
            let valid = true
            let meta_data = {}
            let keys = Object.keys(obj_data[0])

            // other types?
            if (keys.filter(i => i.indexOf("Pts ") != -1).length > 0) { // kiwi type data
                let gw_keys = keys.filter(i => i.indexOf("Pts ") != -1 && i.indexOf('-') == -1)
                // convert kiwi type to review type
                gw_keys.forEach((g) => {
                    let gw = g.split(' ')[1]
                    csvdata = csvdata.replace('xPts ' + gw, gw + "_Pts")
                    csvdata = csvdata.replace('xMin ' + gw, gw + "_xMins")
                })
                obj_data = jQuery.csv.toObjects(csvdata);
            }

            // Albert data
            const regex = /X(\d{1,2}\_)/gm;
            const subst = `$1`;
            csvdata = csvdata.replace(regex, subst);
            csvdata = csvdata.replace(/"id"/gm, '"ID"')
            obj_data = jQuery.csv.toObjects(csvdata);

            keys = Object.keys(obj_data[0])
            if (keys.filter(i => i.indexOf("_Pts") != -1).length > 0) { // fplreview type data
                let gw_keys = keys.filter(i => i.indexOf("_Pts") != -1)
                let gws = gw_keys.map(i => parseInt(i.split("_")[0]))
                let start_gw = _.min(gws)
                let finish_gw = _.max(gws)
                let horizon = parseInt(finish_gw) - parseInt(start_gw) + 1
                let filename = f.name
                let dt = JSON.parse(JSON.stringify(new Date()))
                let status = 'ready'
                let id = getRandomId()
                meta_data = {id, gws, start_gw, finish_gw, horizon, filename, dt, status}
            }
            else {
                valid = false
            }

            // push
            if(valid) {
                app.addData(csvdata, obj_data, meta_data)
                app.last_loaded.push(meta_data.id)
            }
            else {
                // show error message here
            }
        });
        reader.readAsText(f, 'ISO-8859-1');
    })
    $("#name-modal").modal('show')
}

$(document).ready(() => {
    // define drag-drop events
    let dropArea = document.getElementById('load_area');

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false)
    });

    function preventDefaults(e) {
        e.preventDefault()
        e.stopPropagation()
    };

    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, highlight, false)
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, unhighlight, false)
    });

    function highlight(e) {
        dropArea.classList.add('highlight_box')
    };

    function unhighlight(e) {
        dropArea.classList.remove('highlight_box')
    };

    dropArea.addEventListener('drop', handleDrop, false)

    function handleDrop(e) {
        let dt = e.dataTransfer
        let files = dt.files
        handleFiles(files)
    }

    // get existing data
    let raw_data = window.localStorage.getItem('xp_storage')
    if (raw_data) {
        let json_data = JSON.parse(raw_data)
        app.raw_data = json_data
    }
    else {
        // nothing -_-
    }



})