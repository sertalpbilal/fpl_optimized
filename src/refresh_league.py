#!/usr/bin/python3

from collect import create_folders, get_fpl_analytics_league

if __name__ == "__main__":
    input_folder, output_folder = create_folders()
    get_fpl_analytics_league(input_folder)
