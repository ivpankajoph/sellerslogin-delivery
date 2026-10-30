export const HANDOFF_BOOT = `(function(){
  if (location.pathname !== "/auth/handoff") return;
  var params = new URLSearchParams(location.hash.replace(/^#/, ""));
  var token = params.get("token") || "";
  if (!token) { location.replace("/login"); return; }
  var payload = {};
  try {
    var part = (token.split(".")[1] || "").replace(/-/g, "+").replace(/_/g, "/");
    while (part.length % 4) part += "=";
    payload = JSON.parse(atob(part));
  } catch (e) {
    location.replace("/login");
    return;
  }
  var user = {
    id: payload.user_id || payload.id,
    role: payload.role,
    email: payload.email,
    name: payload.name || payload.email || "Member",
    account_type: payload.account_type,
    vendor_name: payload.name
  };
  localStorage.setItem("sld-delivery-session", JSON.stringify({ token: token, user: user }));
  var next = new URLSearchParams(location.search).get("next") || "/delivery-system";
  if (next.indexOf("/courier") !== 0 && next.indexOf("/delivery-system") !== 0) next = "/delivery-system";
  location.replace(next);
})();`;
