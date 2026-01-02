from urllib.parse import urlparse, parse_qs
from google_auth_oauthlib.flow import Flow

REDIRECTED_URL = "http://localhost:8000/api/gmail/oauth/callback?state=7aen4lrkQCXSYfmvhlvR9L67yGkTUO&code=4/0ATX87lPwA0xQiOAe6LGjT0u6s70NDlUqSN89P53uXlnUBBFmQVK1V53TLbcIn9j25e09AQ&scope=https://www.googleapis.com/auth/gmail.readonly%20https://www.googleapis.com/auth/gmail.send"

CLIENT_ID = os.environ["GMAIL_CLIENT_ID"]
CLIENT_SECRET = os.environ["GMAIL_CLIENT_SECRET"]

code = parse_qs(urlparse(REDIRECTED_URL).query)["code"][0]

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
flow.fetch_token(code=code)

print("\nREFRESH TOKEN:\n")
print(flow.credentials.refresh_token)
