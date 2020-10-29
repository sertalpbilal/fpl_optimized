#!/usr/bin/python3

from flask_frozen import Freezer
from app import app, list_all_snapshots

def freeze_all():
    freezer = Freezer(app)
    freezer.freeze()
