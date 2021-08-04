from cryptography.fernet import Fernet
import os

def write_key():
    key = Fernet.generate_key()
    with open("secret.key", "wb") as key_file:
        key_file.write(key)


def load_key():
    return open("secret.key", "rb").read()


def encrypt(filename, local_key=True):
    if local_key:
        key = load_key()
    else:
        key = os.environ.get('FERNET_KEY')
    f = Fernet(key)
    with open(filename, "rb") as file:
        file_data = file.read()
    encrypted_data = f.encrypt(file_data)
    with open(filename + "-encrypted", "wb") as file:
        file.write(encrypted_data)


def decrypt(filename, local_key=True):
    if local_key:
        key = load_key()
    else:
        key = os.environ.get('FERNET_KEY')
    f = Fernet(key)
    with open(filename + "-encrypted", "rb") as file:
        encrypted_data = file.read()
    decrypted_data = f.decrypt(encrypted_data)
    with open(filename, "wb") as file:
        file.write(decrypted_data)