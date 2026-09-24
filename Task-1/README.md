# Harbor & Oak

A small Django store with product listings, cart, checkout, and accounts.

## Setup

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_products
python manage.py createsuperuser
python manage.py runserver
```

Open http://127.0.0.1:8000/

- Shop and product pages work without an account.
- Cart is stored in the database (session for guests, user after login).
- Checkout and order history require login.
- Admin: http://127.0.0.1:8000/admin/
