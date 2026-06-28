import requests
from fastapi import FastAPI

app = FastAPI(title="Order Service")


@app.post("/orders/create")
def create_order(user_id: str, items: list):
    user = requests.get("http://user-service/users/1").json()
    charge = requests.post(
        "http://payment-service/payments/charge",
        json={"user_id": user_id, "amount": 10.0},
    ).json()
    return {"order_id": "ord-001", "user": user["name"], "charge": charge}


@app.get("/orders/{id}")
def get_order(id: str):
    return {"id": id, "status": "shipped", "items": ["widget-a", "widget-b"]}
