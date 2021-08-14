
import requests
import json

def get_league_ids():
    league_id = "31936"
    teams = []
    has_next = True
    page = 1
    while has_next:
        print(page)
        r = requests.get(f"https://fantasy.premierleague.com/api/leagues-classic/{league_id}/standings/?page_standings={page}")
        has_next = r.json()['standings']['has_next']
        teams.extend([i for i in r.json()['standings']['results']])
        page = r.json()['standings']['page'] + 1
        print(len(teams))
    
    with open('build/static/json/league.json', 'w') as f:
        json.dump(teams, f)

    print(f"Total: {len(teams)} teams")

if __name__ == '__main__':
    get_league_ids()
