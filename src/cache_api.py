
import requests
import json
import os

BASE = "https://fantasy.premierleague.com/api/"
season = "2020-21"
API = f"build/data/{season}/api/"
TEAM = 2221044

def cache_page_as(page, address):
    URL = BASE + page
    TARGET = API + address

    if os.path.exists(TARGET):
        print("Existing target... skipping")
        return

    print(f"Requesting {URL} -> {TARGET}")
    r = requests.get(URL)
    if r.status_code != 200:
        print(r.status_code)
        print(f"Error in request {page}")
        return
    with open(TARGET, 'w') as f:
        json.dump(r.json(), f)

cache_page_as("bootstrap-static/", "main.json")
cache_page_as("fixtures/", "fixtures/all.json")
for gw in range(1,39):
    cache_page_as(f"fixtures/?event={gw}", f"fixtures/{gw}.json")
for gw in range(1,39):
    cache_page_as(f"event/{gw}/live", f"live/{gw}.json")
cache_page_as(f"entry/{TEAM}/", "team_main.json")
cache_page_as(f"entry/{TEAM}/history/", "team_history.json")
cache_page_as(f"entry/{TEAM}/transfers/", "team_transfers.json")
for gw in range(1,39):
    cache_page_as(f"entry/{TEAM}/event/{gw}/picks/", f"picks/{gw}.json")

