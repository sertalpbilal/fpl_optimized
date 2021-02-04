#!/usr/bin/python3

from collect import sample_fpl_teams
# from collect import create_folders
import os

if __name__ == "__main__":
    gw = os.environ.get('GW', None)
    sample_fpl_teams(gw)
