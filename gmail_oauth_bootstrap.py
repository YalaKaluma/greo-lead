from google_auth_oauthlib.flow import Flow

CLIENT_ID = os.environ["GMAIL_CLIENT_ID"]
CLIENT_SECRET = os.environ["GMAIL_CLIENT_SECRET"]


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
        "https://www.googleapis.com/auth/gmail.readonly",
    ],
)

flow.redirect_uri = "http://localhost:8000/api/gmail/oauth/callback"


auth_url, _ = flow.authorization_url(
    access_type="offline",
    prompt="consent"
)

print("\nOpen this URL in your browser:\n")
print(auth_url)
