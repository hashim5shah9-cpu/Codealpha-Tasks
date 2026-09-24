from django.core.management.base import BaseCommand

from store.models import Product

PRODUCTS = [
    {
        "name": "Oak Desk Lamp",
        "slug": "oak-desk-lamp",
        "description": "A solid oak lamp with a linen shade. Warm, directional light for late work without glare.",
        "price": "68.00",
        "stock": 18,
        "image_url": "https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?auto=format&fit=crop&w=1200&q=80",
        "accent": "#8b5a2b",
        "category": "Lighting",
    },
    {
        "name": "Linen Throw",
        "slug": "linen-throw",
        "description": "Stone-washed European linen, 130 x 170 cm. Softens with every wash and never looks fussed.",
        "price": "54.00",
        "stock": 24,
        "image_url": "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=1200&q=80",
        "accent": "#a67c52",
        "category": "Textiles",
    },
    {
        "name": "Ceramic Pour-Over",
        "slug": "ceramic-pour-over",
        "description": "Hand-thrown dripper with a spiral rib. Holds heat and pours a clean, even bed.",
        "price": "32.00",
        "stock": 30,
        "image_url": "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1200&q=80",
        "accent": "#9c4a2a",
        "category": "Kitchen",
    },
    {
        "name": "Walnut Cutting Board",
        "slug": "walnut-cutting-board",
        "description": "End-grain American walnut with a juice groove. Thick enough to last a decade of weeknights.",
        "price": "86.00",
        "stock": 12,
        "image_url": "https://images.unsplash.com/photo-1590794056226-79ef3a8147e1?auto=format&fit=crop&w=1200&q=80",
        "accent": "#5c4033",
        "category": "Kitchen",
    },
    {
        "name": "Wool Runner",
        "slug": "wool-runner",
        "description": "Hand-loomed wool in a muted stripe. Sized for a hallway or the foot of a bed.",
        "price": "140.00",
        "stock": 8,
        "image_url": "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=1200&q=80",
        "accent": "#6b4f3b",
        "category": "Living",
    },
    {
        "name": "Brass Candle Holders",
        "slug": "brass-candle-holders",
        "description": "A pair of turned brass holders. They darken honestly with use; no lacquer, no fuss.",
        "price": "42.00",
        "stock": 20,
        "image_url": "https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=1200&q=80",
        "accent": "#b08d57",
        "category": "Lighting",
    },
    {
        "name": "Stoneware Mug",
        "slug": "stoneware-mug",
        "description": "Speckled clay, 350 ml, with a handle that actually fits four fingers. Dishwasher safe.",
        "price": "22.00",
        "stock": 40,
        "image_url": "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=1200&q=80",
        "accent": "#7a6a58",
        "category": "Kitchen",
    },
    {
        "name": "Canvas Tote",
        "slug": "canvas-tote",
        "description": "Heavy 16-oz canvas with a leather grip. Deep enough for a market run or a laptop.",
        "price": "38.00",
        "stock": 22,
        "image_url": "https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=1200&q=80",
        "accent": "#3d4f3a",
        "category": "Living",
    },
]


class Command(BaseCommand):
    help = "Load sample catalog products"

    def handle(self, *args, **options):
        created = 0
        for data in PRODUCTS:
            _, was_created = Product.objects.update_or_create(
                slug=data["slug"], defaults=data
            )
            created += int(was_created)
        self.stdout.write(self.style.SUCCESS(f"Catalog ready ({created} new)."))
