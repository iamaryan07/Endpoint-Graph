import requests
from fastapi import FastAPI

app = FastAPI(title="Payment Service")


@app.post("/payments/charge")
def charge(user_id: str, amount: float):
    user = requests.get("http://user-service/users/1").json()
    return {"status": "charged", "user": user["name"], "amount": amount}


@app.get("/payments/{id}")
def get_payment(id: str):
    return {"id": id, "amount": 99.99, "status": "completed"}
