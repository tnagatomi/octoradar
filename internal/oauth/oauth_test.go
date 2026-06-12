package oauth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

// newTestClient returns a client whose requests are routed to handler.
func newTestClient(t *testing.T, clientID string, handler http.HandlerFunc) *Client {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	c := NewClient(clientID)
	c.baseURL = srv.URL
	return c
}

func TestRequestDeviceCode(t *testing.T) {
	var gotPath, gotAccept, gotClientID string
	c := newTestClient(t, "cid-123", func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotAccept = r.Header.Get("Accept")
		_ = r.ParseForm()
		gotClientID = r.Form.Get("client_id")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"device_code": "dev-abc",
			"user_code": "WDJB-MJHT",
			"verification_uri": "https://github.com/login/device",
			"expires_in": 900,
			"interval": 5
		}`))
	})

	dc, err := c.RequestDeviceCode(context.Background())
	if err != nil {
		t.Fatalf("RequestDeviceCode: %v", err)
	}
	if gotPath != "/login/device/code" {
		t.Errorf("path = %q, want /login/device/code", gotPath)
	}
	if gotAccept != "application/json" {
		t.Errorf("Accept = %q, want application/json", gotAccept)
	}
	if gotClientID != "cid-123" {
		t.Errorf("client_id = %q, want cid-123", gotClientID)
	}
	if dc.DeviceCode != "dev-abc" {
		t.Errorf("DeviceCode = %q, want dev-abc", dc.DeviceCode)
	}
	if dc.UserCode != "WDJB-MJHT" {
		t.Errorf("UserCode = %q, want WDJB-MJHT", dc.UserCode)
	}
	if dc.VerificationURI != "https://github.com/login/device" {
		t.Errorf("VerificationURI = %q", dc.VerificationURI)
	}
	if dc.ExpiresIn != 900 {
		t.Errorf("ExpiresIn = %d, want 900", dc.ExpiresIn)
	}
	if dc.Interval != 5 {
		t.Errorf("Interval = %d, want 5", dc.Interval)
	}
}

func TestPollOnceSuccess(t *testing.T) {
	var gotPath, gotGrantType, gotDeviceCode string
	c := newTestClient(t, "cid-123", func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		_ = r.ParseForm()
		gotGrantType = r.Form.Get("grant_type")
		gotDeviceCode = r.Form.Get("device_code")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"access_token":"gho_token","token_type":"bearer","scope":""}`))
	})

	token, slowDown, err := c.pollOnce(context.Background(), "dev-abc")
	if err != nil {
		t.Fatalf("pollOnce: %v", err)
	}
	if token != "gho_token" {
		t.Errorf("token = %q, want gho_token", token)
	}
	if slowDown {
		t.Error("slowDown = true, want false on success")
	}
	if gotPath != "/login/oauth/access_token" {
		t.Errorf("path = %q, want /login/oauth/access_token", gotPath)
	}
	if gotGrantType != "urn:ietf:params:oauth:grant-type:device_code" {
		t.Errorf("grant_type = %q", gotGrantType)
	}
	if gotDeviceCode != "dev-abc" {
		t.Errorf("device_code = %q, want dev-abc", gotDeviceCode)
	}
}

func TestPollOncePending(t *testing.T) {
	c := newTestClient(t, "cid-123", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"error":"authorization_pending","error_description":"pending"}`))
	})

	token, slowDown, err := c.pollOnce(context.Background(), "dev-abc")
	if err != nil {
		t.Fatalf("pending must not be terminal, got err: %v", err)
	}
	if token != "" {
		t.Errorf("token = %q, want empty while pending", token)
	}
	if slowDown {
		t.Error("slowDown = true, want false for authorization_pending")
	}
}

func TestPollOnceSlowDown(t *testing.T) {
	c := newTestClient(t, "cid-123", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"error":"slow_down","interval":10}`))
	})

	token, slowDown, err := c.pollOnce(context.Background(), "dev-abc")
	if err != nil {
		t.Fatalf("slow_down must not be terminal, got err: %v", err)
	}
	if token != "" {
		t.Errorf("token = %q, want empty on slow_down", token)
	}
	if !slowDown {
		t.Error("slowDown = false, want true for slow_down")
	}
}

func TestPollOnceTerminalError(t *testing.T) {
	for _, code := range []string{"access_denied", "expired_token"} {
		t.Run(code, func(t *testing.T) {
			c := newTestClient(t, "cid-123", func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`{"error":"` + code + `","error_description":"terminal"}`))
			})

			if _, _, err := c.pollOnce(context.Background(), "dev-abc"); err == nil {
				t.Fatalf("%s must be terminal, got nil error", code)
			}
		})
	}
}

func TestRequestDeviceCodeError(t *testing.T) {
	c := newTestClient(t, "cid-123", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`not found`))
	})

	if _, err := c.RequestDeviceCode(context.Background()); err == nil {
		t.Fatal("expected error for non-200 response, got nil")
	}
}

func TestRequestDeviceCodeAPIError(t *testing.T) {
	// GitHub can answer 200 with an error payload (e.g. device flow disabled).
	c := newTestClient(t, "cid-123", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"error":"device_flow_disabled","error_description":"Device flow is not enabled"}`))
	})

	if _, err := c.RequestDeviceCode(context.Background()); err == nil {
		t.Fatal("expected error for error payload, got nil")
	}
}
