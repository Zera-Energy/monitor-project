// public/js/config.js
window.API_BASE = "https://monitor-project.onrender.com";
console.log("[config] API_BASE =", window.API_BASE);

/* =========================
   ✅ MQTT (WebSocket) 설정
   - HiveMQ Cloud 예시
   - 너 계정 값으로 바꿔야 함
========================= */

// 1) 제일 확실한 방식: URL을 통째로 지정 (추천)
window.MQTT_URL = "wss://babc7822e95e4348ad220c1aaf947ed2.s1.eu.hivemq.cloud:8884/mqtt";

// 2) 인증정보 (HiveMQ Cloud에서 발급한 username/password)
window.MQTT_USERNAME = "backend_reader";
window.MQTT_PASSWORD = "Tovzera1379!";

console.log("[config] MQTT_URL =", window.MQTT_URL);