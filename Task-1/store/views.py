from django.contrib.auth import login
from django.contrib.auth.decorators import login_required
from django.contrib.auth.views import LoginView, LogoutView
from django.db import transaction
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_POST

from .forms import CheckoutForm, RegisterForm
from .models import CartItem, Order, OrderItem, Product


def _ensure_session(request):
    if not request.session.session_key:
        request.session.create()
    return request.session.session_key


def _cart_qs(request):
    if request.user.is_authenticated:
        return CartItem.objects.filter(user=request.user).select_related("product")
    return CartItem.objects.filter(
        user__isnull=True, session_key=_ensure_session(request)
    ).select_related("product")


def product_list(request):
    products = Product.objects.all()
    category = request.GET.get("c")
    if category:
        products = products.filter(category=category)
    categories = (
        Product.objects.order_by("category")
        .values_list("category", flat=True)
        .distinct()
    )
    return render(
        request,
        "store/product_list.html",
        {"products": products, "categories": categories, "active_category": category},
    )


def product_detail(request, slug):
    product = get_object_or_404(Product, slug=slug)
    related = Product.objects.filter(category=product.category).exclude(pk=product.pk)[:3]
    return render(
        request,
        "store/product_detail.html",
        {"product": product, "related": related},
    )


def cart_view(request):
    items = list(_cart_qs(request))
    total = sum(item.line_total for item in items)
    return render(request, "store/cart.html", {"items": items, "total": total})


@require_POST
def add_to_cart(request, slug):
    product = get_object_or_404(Product, slug=slug)
    qty = max(1, int(request.POST.get("quantity", 1)))
    if product.stock < 1:
        if request.headers.get("X-Requested-With") == "XMLHttpRequest":
            return JsonResponse({"ok": False, "error": "Out of stock"}, status=400)
        return redirect("product_detail", slug=slug)

    if request.user.is_authenticated:
        item, created = CartItem.objects.get_or_create(
            user=request.user, product=product, defaults={"quantity": 0}
        )
    else:
        item, created = CartItem.objects.get_or_create(
            user=None,
            session_key=_ensure_session(request),
            product=product,
            defaults={"quantity": 0},
        )

    item.quantity = min(item.quantity + qty, product.stock)
    item.save()

    if request.headers.get("X-Requested-With") == "XMLHttpRequest":
        count = sum(_cart_qs(request).values_list("quantity", flat=True))
        return JsonResponse({"ok": True, "cart_count": count})
    return redirect("cart")


@require_POST
def update_cart(request, item_id):
    item = get_object_or_404(_cart_qs(request), pk=item_id)
    action = request.POST.get("action")
    if action == "increase":
        item.quantity = min(item.quantity + 1, item.product.stock)
        item.save()
    elif action == "decrease":
        if item.quantity <= 1:
            item.delete()
        else:
            item.quantity -= 1
            item.save()
    elif action == "remove":
        item.delete()
    return redirect("cart")


@login_required
def checkout(request):
    items = list(_cart_qs(request))
    if not items:
        return redirect("cart")
    total = sum(item.line_total for item in items)
    initial = {
        "full_name": request.user.get_full_name() or request.user.username,
        "email": request.user.email,
    }
    form = CheckoutForm(request.POST or None, initial=initial)

    if request.method == "POST" and form.is_valid():
        with transaction.atomic():
            order = form.save(commit=False)
            order.user = request.user
            order.total = total
            order.save()
            for item in items:
                product = Product.objects.select_for_update().get(pk=item.product_id)
                qty = min(item.quantity, product.stock)
                if qty < 1:
                    continue
                OrderItem.objects.create(
                    order=order,
                    product=product,
                    quantity=qty,
                    price=product.price,
                )
                product.stock -= qty
                product.save(update_fields=["stock"])
            _cart_qs(request).delete()
        return redirect("order_success", order_id=order.pk)

    return render(
        request,
        "store/checkout.html",
        {"form": form, "items": items, "total": total},
    )


@login_required
def order_success(request, order_id):
    order = get_object_or_404(Order, pk=order_id, user=request.user)
    return render(request, "store/order_success.html", {"order": order})


@login_required
def order_history(request):
    orders = Order.objects.filter(user=request.user).prefetch_related("items__product")
    return render(request, "store/orders.html", {"orders": orders})


def register(request):
    if request.user.is_authenticated:
        return redirect("product_list")
    form = RegisterForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        user = form.save()
        login(request, user)
        return redirect("product_list")
    return render(request, "store/register.html", {"form": form})


class StoreLoginView(LoginView):
    template_name = "store/login.html"

    def form_valid(self, form):
        session_key = self.request.session.session_key
        response = super().form_valid(form)
        if session_key:
            guest_items = CartItem.objects.filter(user__isnull=True, session_key=session_key)
            for guest in guest_items:
                existing = CartItem.objects.filter(
                    user=self.request.user, product=guest.product
                ).first()
                if existing:
                    existing.quantity = min(
                        existing.quantity + guest.quantity, guest.product.stock
                    )
                    existing.save()
                    guest.delete()
                else:
                    guest.user = self.request.user
                    guest.session_key = ""
                    guest.save()
        return response


class StoreLogoutView(LogoutView):
    http_method_names = ["get", "post"]
