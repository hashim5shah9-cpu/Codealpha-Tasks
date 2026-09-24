from django.db.models import Sum

from .models import CartItem


def _cart_filter(request):
    if request.user.is_authenticated:
        return {"user": request.user}
    if not request.session.session_key:
        return {"session_key": ""}
    return {"user__isnull": True, "session_key": request.session.session_key}


def cart_count(request):
    qs = CartItem.objects.filter(**_cart_filter(request))
    total = qs.aggregate(n=Sum("quantity"))["n"] or 0
    return {"cart_count": total}
