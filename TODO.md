# TODO - llm-flight-controller

## Future Enhancements

### Auth Retry Logic
Add automatic auth retry to Model class when AuthenticationError is thrown. Similar to rate limit retry, but:
- Catch AuthenticationError in Model.sendMessage()
- Check if auth provider has refresh capability (e.g., AWSSSOAuth.refresh())
- Trigger auth refresh (via IAuthHandler callbacks)
- Retry request once after successful refresh
- Only retry once (not multiple attempts like rate limits)

**Benefits:**
- Automatic token refresh without user intervention
- Consistent behavior across all library users
- No need for consumers to implement sendWithAuthRetry()

**Challenges:**
- Auth refresh is provider-specific (AWS SSO vs API keys vs OAuth)
- May need IAuthProvider.refresh() interface method
- Interactive auth (device code, browser) needs IAuthHandler integration

**Current workaround:**
Consumers can catch AuthenticationError and handle refresh manually (see dispatch's sendWithAuthRetry for example).
