

import json
import pathlib
from collect import get_fpl_info

def read_league_teams():
    base_folder = pathlib.Path(__file__).parent.resolve()
    with open(base_folder / '../static/json/fpl_analytics.json') as f:
        data = json.load(f)
    return data

def get_current_gw():
    data = get_fpl_info('now')
    gws = [i for i in data['events'] if i['is_previous'] == True]
    return gws[0]['id']

def save_to_json(name, data):
    with open(name, 'w') as f:
        json.dump(data, f)

