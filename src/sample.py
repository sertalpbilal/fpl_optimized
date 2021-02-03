#!/usr/bin/python3

# from collect import sample_fpl_teams
from collect import create_folders
import os

# if __name__ == "__main__":
#     gw = os.environ.get('GW', None)
#     sample_fpl_teams(gw)

if __name__ == "__main__":
    input_folder, output_folder = create_folders()
    print(input_folder)
