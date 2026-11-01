export async function onRequestPost() {
  return new Response(JSON.stringify({
    message: "Авторизацію ще не налаштовано. Зверніться до штабу SANG."
  }), {
    status: 503,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export async function onRequest(context) {
  if (context.request.method !== "POST") {
    return new Response(JSON.stringify({ message: "Метод не підтримується." }), {
      status: 405,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Allow": "POST",
        "Cache-Control": "no-store"
      }
    });
  }
  return onRequestPost(context);
}