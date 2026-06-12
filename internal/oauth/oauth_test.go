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
