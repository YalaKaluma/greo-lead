import os
from dotenv import load_dotenv
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials

os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"

# Load .env variables
load_dotenv()

CLIENT_ID = os.environ["GMAIL_CLIENT_ID"]
CLIENT_SECRET = os.environ["GMAIL_CLIENT_SECRET"]

# IMPORTANT:
# Paste the FULL redirect URL you got in the browser below
# Example:
# REDIRECT_RESPONSE = "http://localhost:8000/api/gmail/oauth/callback?code=XXXX&scope=YYYY"
REDIRECT_RESPONSE = "http://localhost:8000/api/gmail/oauth/callback?state=NVUeqIzvuYLtoLxUsYp82FzMxZvfI7&code=4/0ASc3gC1kHAnBHerQgCFtFuNMWaKMPdPlPKhgZa4Z_ilclsZJHBUs68ArppEPSG-z1GYldQ&scope=https://www.googleapis.com/auth/gmail.send%20https://www.googleapis.com/auth/gmail.modify"

flow = Flow.from_client_config(
    {
        "web": {
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    },
    scopes=[
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.modify",
    ],
)

flow.redirect_uri = "http://localhost:8000/api/gmail/oauth/callback"

# Exchange authorization code for tokens
flow.fetch_token(authorization_response=REDIRECT_RESPONSE)

credentials: Credentials = flow.credentials

print("\n✅ OAuth flow completed successfully\n")
print("Add this REFRESH TOKEN to Railway as GMAIL_REFRESH_TOKEN:\n")
print(credentials.refresh_token)
