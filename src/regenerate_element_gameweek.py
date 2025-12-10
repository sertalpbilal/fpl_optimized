#!/usr/bin/python3
"""
This module regenerates element_gameweek.csv files from projection files.
Use this when projection files are uploaded after the deadline.

Usage:
  python regenerate_element_gameweek.py                    # Process all available projections
  python regenerate_element_gameweek.py --gw 15            # Process only GW 15
  python regenerate_element_gameweek.py --gw 15 --date 2025-12-10  # Process GW 15 with specific date
"""

import argparse
import datetime
import json
import os
import pathlib
import sys
import glob
import pytz
import pandas as pd
from urllib.request import urlopen


FPL_API = {
    'now': "https://fantasy.premierleague.com/api/bootstrap-static/",
    'fixture': "https://fantasy.premierleague.com/api/fixtures/",
}


def read_static():
    """Reads user-specified static values from JSON file"""
    # Get the src directory (where this script is located)
    src_folder = pathlib.Path(__file__).parent
    with open(src_folder / 'static-values.json') as f:
        data = json.load(f)
    return data


def get_base_folder():
    """Get the repository root folder (parent of src/)"""
    src_folder = pathlib.Path(__file__).parent
    return src_folder.parent


def get_element_event_expected_points(r):
    """Extract expected points from projection data"""
    if pd.isna(r['event']):
        return 0
    else:
        try:
            sc = float(r[f"{int(r['event'])}_Pts"])
            if pd.isna(sc):
                return 0
            elif sc is None:
                return 0
            else:
                return sc
        except:
            return 0


def get_element_event_expected_minutes(r):
    """Extract expected minutes from projection data"""
    if pd.isna(r['event']):
        return 0
    else:
        try:
            sc = float(r[f"{int(r['event'])}_xMins"])
            if pd.isna(sc):
                return 0
            elif sc is None:
                return 0
            else:
                return sc
        except:
            return 0


def get_existing_data_folders(season):
    """Find all existing data folders for the season"""
    base_folder = get_base_folder()
    all_folders = glob.glob(str(base_folder / f'build/data/{season}/GW*/*/'))
    if sys.platform == 'win32':
        all_folders = [i.replace('\\', '/') for i in all_folders]
    
    folder_dict = {}
    for folder in all_folders:
        parts = folder.split('/')
        if len(parts) >= 5:
            gw = parts[3]  # GW{X}
            date = parts[4]  # date
            gw_num = int(gw.replace('GW', ''))
            if gw_num not in folder_dict:
                folder_dict[gw_num] = []
            folder_dict[gw_num].append({
                'gw': gw_num,
                'gw_str': gw,
                'date': date,
                'path': folder,
                'input_folder': pathlib.Path(base_folder / folder / 'input')
            })
    
    # Sort by date for each GW, take the latest
    latest_folders = {}
    for gw_num, folders in folder_dict.items():
        sorted_folders = sorted(folders, key=lambda x: x['date'], reverse=True)
        latest_folders[gw_num] = sorted_folders[0]
    
    return latest_folders


def find_available_projections(season):
    """Find all available projection files"""
    src_folder = pathlib.Path(__file__).parent
    projection_folder = pathlib.Path(src_folder / f'static/projection/{season}')
    
    if not projection_folder.exists():
        print(f"Projection folder not found: {projection_folder}")
        return {}
    
    projection_files = glob.glob(str(projection_folder / 'gw*.csv'))
    projections = {}
    
    for file_path in projection_files:
        filename = os.path.basename(file_path)
        # Extract GW number from filename like 'gw15.csv'
        gw_num = int(filename.replace('gw', '').replace('.csv', ''))
        projections[gw_num] = file_path
    
    return projections


def regenerate_element_gameweek(target_folder, season, gw, projection_file):
    """
    Regenerate element_gameweek.csv for a specific GW from projection file
    
    Args:
        target_folder: Path to the input folder where element_gameweek.csv should be saved
        season: Season string (e.g., '2025-26')
        gw: Gameweek number
        projection_file: Path to the projection CSV file
    """
    print(f"Regenerating element_gameweek.csv for GW{gw} using {projection_file}")
    
    # Read required files
    team_df = pd.read_csv(target_folder / "team.csv")
    fixture_df = pd.read_csv(target_folder / "fixture.csv")
    element_df = pd.read_csv(target_folder / "element.csv")
    
    # Read projection data
    try:
        prediction_df = pd.read_csv(projection_file).drop_duplicates()
    except Exception as e:
        print(f"Error reading projection file {projection_file}: {e}")
        return False
    
    # Extract weeks from projection columns
    weeks = [i.split('_')[0] for i in list(filter(lambda x: '_Pts' in x, prediction_df.columns.tolist()))]
    
    if not weeks:
        print(f"No projection columns found in {projection_file}")
        return False
    
    print(f"Found projections for weeks: {weeks}")
    
    # Filter fixtures for the projection period
    filtered_fixture = fixture_df[(fixture_df['event'] >= int(weeks[0])) & (fixture_df['event'] <= int(weeks[-1]))]
    filtered_fixture = filtered_fixture[['event', 'id', 'team_a', 'team_h']]
    
    # Create home and away game dataframes
    home_games = filtered_fixture.rename(columns={'team_h': 'team', 'team_a': 'opp_team'}).copy().assign(side='home')
    away_games = filtered_fixture.rename(columns={'team_a': 'team', 'team_h': 'opp_team'}).copy().assign(side='away')
    combined_games = pd.concat([home_games, away_games], sort=False)
    
    # Merge element data with team names
    element_df = pd.merge(
        element_df, 
        team_df.rename(columns={'id': 'team_id', 'name': 'team_name'}), 
        how='left', 
        left_on=['team'], 
        right_on=['team_id']
    )
    
    # Merge with prediction data
    element_df = pd.merge(element_df, prediction_df, how='left', left_on=['id'], right_on=['ID'])
    
    # Create full element_gameweek dataframe (cartesian product of players and weeks)
    full_element_gameweek_df = pd.merge(
        left=element_df.rename(columns={'id': 'player_id'}).assign(key=1),
        right=pd.DataFrame(weeks, columns=['event']).assign(key=1),
        on='key',
        how='inner'
    ).drop(["key"], axis=1)
    
    full_element_gameweek_df['event'] = full_element_gameweek_df['event'].astype(int)
    
    # Merge with fixture data
    element_gameweek_df = pd.merge(
        left=full_element_gameweek_df,
        right=combined_games.rename(columns={'id': 'event_id'}),
        on=['event', 'team'],
        how='left'
    )
    
    # Calculate expected points and minutes
    element_gameweek_df['points_md'] = element_gameweek_df.apply(get_element_event_expected_points, axis=1)
    element_gameweek_df['xmins_md'] = element_gameweek_df.apply(get_element_event_expected_minutes, axis=1)
    
    # Select and order columns
    element_gameweek_df = element_gameweek_df[[
        'player_id', 'event', 'event_id', 'web_name', 
        'points_md', 'xmins_md', 'team', 'opp_team'
    ]].copy()
    
    element_gameweek_df.sort_values(by=['player_id', 'event'], inplace=True, ignore_index=True)
    
    # Save the file
    output_file = target_folder / 'element_gameweek.csv'
    element_gameweek_df.to_csv(output_file, index=True)
    
    print(f"✓ Generated {output_file}")
    print(f"  - {len(element_gameweek_df)} rows")
    print(f"  - {len(element_gameweek_df['player_id'].unique())} unique players")
    print(f"  - GWs: {sorted(element_gameweek_df['event'].unique())}")
    
    return True


def create_new_folder_from_projection(season, gw, projection_file):
    """
    Create a new data folder structure for a GW from scratch using projection file
    
    Args:
        season: Season string
        gw: Gameweek number
        projection_file: Path to projection file
    """
    base_folder = get_base_folder()
    date = datetime.datetime.now(pytz.timezone('EST')).date().isoformat()
    
    input_folder = pathlib.Path(base_folder / f"build/data/{season}/GW{gw}/{date}/input/")
    input_folder.mkdir(parents=True, exist_ok=True)
    
    print(f"Creating new data folder for GW{gw} at {input_folder}")
    
    # Get current FPL API data
    try:
        with urlopen(FPL_API['now']) as url:
            data = json.loads(url.read().decode())
        
        element_data = pd.DataFrame(data['elements'])
        element_data.to_csv(input_folder / "element.csv", index=False)
        
        team_data = pd.DataFrame(data['teams'])
        team_data.to_csv(input_folder / "team.csv", index=False)
        
        element_type_data = pd.DataFrame(data['element_types'])
        element_type_data.to_csv(input_folder / "element_type.csv", index=False)
        
        with urlopen(FPL_API['fixture']) as url:
            fixture_data = json.loads(url.read().decode())
        
        fixture_df = pd.DataFrame(fixture_data)
        fixture_df.to_csv(input_folder / "fixture.csv", index=False)
        
        print("✓ Downloaded FPL API data")
        
    except Exception as e:
        print(f"Error downloading FPL API data: {e}")
        return None
    
    # Generate element_gameweek.csv
    success = regenerate_element_gameweek(input_folder, season, gw, projection_file)
    
    if success:
        return input_folder
    return None


def main():
    parser = argparse.ArgumentParser(
        description='Regenerate element_gameweek.csv files from projection files'
    )
    parser.add_argument(
        '--gw',
        type=int,
        help='Specific gameweek to process (if not specified, process all available projections)'
    )
    parser.add_argument(
        '--date',
        type=str,
        help='Specific date folder to update (format: YYYY-MM-DD). If not specified, uses latest or creates new'
    )
    parser.add_argument(
        '--force-new',
        action='store_true',
        help='Force creation of new folder even if one exists for today'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Show what would be done without actually doing it'
    )
    
    args = parser.parse_args()
    
    # Read configuration
    vals = read_static()
    season = vals['season']
    
    print(f"=== Element Gameweek Regeneration Tool ===")
    print(f"Season: {season}")
    print()
    
    # Find available projections
    projections = find_available_projections(season)
    
    if not projections:
        print("No projection files found!")
        print(f"Expected location: static/projection/{season}/gwX.csv")
        return 1
    
    print(f"Found {len(projections)} projection files:")
    for gw_num in sorted(projections.keys()):
        print(f"  - GW{gw_num}: {projections[gw_num]}")
    print()
    
    # Find existing data folders
    existing_folders = get_existing_data_folders(season)
    
    # Determine which GWs to process
    if args.gw:
        gws_to_process = [args.gw] if args.gw in projections else []
        if not gws_to_process:
            print(f"Error: No projection file found for GW{args.gw}")
            return 1
    else:
        gws_to_process = sorted(projections.keys())
    
    print(f"Will process GWs: {gws_to_process}")
    print()
    
    if args.dry_run:
        print("DRY RUN MODE - No changes will be made")
        print()
    
    # Process each GW
    processed_count = 0
    skipped_count = 0
    error_count = 0
    
    for gw_num in gws_to_process:
        projection_file = projections[gw_num]
        print(f"--- Processing GW{gw_num} ---")
        
        # Determine target folder
        target_folder = None
        
        if args.date:
            # Use specific date
            base_folder = get_base_folder()
            target_folder = pathlib.Path(
                base_folder / f"build/data/{season}/GW{gw_num}/{args.date}/input/"
            )
            if not target_folder.exists():
                print(f"Folder not found: {target_folder}")
                if not args.dry_run:
                    print("Creating new folder with current FPL data...")
                    target_folder = create_new_folder_from_projection(season, gw_num, projection_file)
                    if target_folder:
                        processed_count += 1
                    else:
                        error_count += 1
                    continue
        elif args.force_new:
            # Create new folder
            if not args.dry_run:
                target_folder = create_new_folder_from_projection(season, gw_num, projection_file)
                if target_folder:
                    processed_count += 1
                else:
                    error_count += 1
            else:
                print(f"Would create new folder for GW{gw_num}")
                processed_count += 1
            continue
        elif gw_num in existing_folders:
            # Use existing latest folder
            folder_info = existing_folders[gw_num]
            target_folder = folder_info['input_folder']
            print(f"Using existing folder: {folder_info['date']}")
        else:
            # No existing folder, create new one
            if not args.dry_run:
                print("No existing folder found, creating new one...")
                target_folder = create_new_folder_from_projection(season, gw_num, projection_file)
                if target_folder:
                    processed_count += 1
                else:
                    error_count += 1
            else:
                print(f"Would create new folder for GW{gw_num}")
                processed_count += 1
            continue
        
        # Check if required files exist
        required_files = ['element.csv', 'team.csv', 'fixture.csv']
        missing_files = [f for f in required_files if not (target_folder / f).exists()]
        
        if missing_files:
            print(f"Missing required files: {missing_files}")
            print("Skipping this GW")
            skipped_count += 1
            continue
        
        # Regenerate element_gameweek.csv
        if not args.dry_run:
            success = regenerate_element_gameweek(target_folder, season, gw_num, projection_file)
            if success:
                processed_count += 1
            else:
                error_count += 1
        else:
            print(f"Would regenerate: {target_folder / 'element_gameweek.csv'}")
            processed_count += 1
        
        print()
    
    # Summary
    print("=" * 50)
    print("SUMMARY")
    print(f"Processed: {processed_count}")
    print(f"Skipped:   {skipped_count}")
    print(f"Errors:    {error_count}")
    
    if args.dry_run:
        print("\nThis was a dry run. No files were modified.")
    
    return 0 if error_count == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
