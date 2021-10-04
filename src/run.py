#!/usr/bin/python3

import sys

from solve import solve_all
from freezer import freeze_all
from simulator import generate_simulations

if __name__ == "__main__":

    opts = ''
    if len(sys.argv) > 1:
        opts = sys.argv[1]

    if opts != "skip-opt":
        from collect import get_all_data, encrypt_files
        input_folder, output_folder = get_all_data()
        solve_all(input_folder, output_folder)
        generate_simulations(input_folder, output_folder, 100)
        encrypt_files(input_folder, page='free-planner', remove=True)
    freeze_all()
