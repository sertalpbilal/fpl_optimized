from cryptography.fernet import Fernet
import os
import json

def write_key(key_name):
    key = Fernet.generate_key()
    with open("secret.key", "w") as key_file:
        json.dump({key_name: key.decode()}, key_file)

def load_key(key_name):
    with open("secret.key", "r") as key_file:
        keys = json.load(key_file)
    return keys[key_name].encode()


def encrypt(filename, key_name='FERNET_KEY'):
    try:
        key = load_key(key_name)
    except:
        key = os.environ.get(key_name)
    f = Fernet(key)
    with open(filename, "rb") as file:
        file_data = file.read()
    encrypted_data = f.encrypt(file_data)
    with open(filename + "-encrypted", "wb") as file:
        file.write(encrypted_data)


def decrypt(filename, key_name='FERNET_KEY'):
    try:
        key = load_key(key_name)
    except:
        key = os.environ.get(key_name)
    f = Fernet(key)
    with open(filename + "-encrypted", "rb") as file:
        encrypted_data = file.read()
    decrypted_data = f.decrypt(encrypted_data)
    with open(filename, "wb") as file:
        file.write(decrypted_data)


def read_encrypted(filename, key_name='FERNET_KEY'):
    try:
        key = load_key(key_name)
    except:
        key = os.environ.get(key_name)
    f = Fernet(key)
    with open(filename + "-encrypted", "rb") as file:
        encrypted_data = file.read()
    decrypted_data = f.decrypt(encrypted_data)
    return decrypted_data

