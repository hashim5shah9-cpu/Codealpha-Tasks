from django.core.management.base import BaseCommand
from django.contrib.auth.models import User

from core.models import Comment, Follow, Like, Post


class Command(BaseCommand):
    help = "Seed the database with demo users, posts, likes and follows."

    def handle(self, *args, **options):
        demo_users = [
            ("alice", "alice@example.com", "alicepass123"),
            ("bob", "bob@example.com", "bobpass123"),
            ("charlie", "charlie@example.com", "charliepass123"),
        ]

        created = []
        for username, email, password in demo_users:
            user, was_created = User.objects.get_or_create(
                username=username, defaults={"email": email, "first_name": username.title()}
            )
            if was_created:
                user.set_password(password)
                user.save()
                user.profile.bio = f"Hi, I'm {username}. Welcome to my profile!"
                user.profile.save()
                created.append(username)
                self.stdout.write(f"  + created user '{username}'")
            else:
                self.stdout.write(f"  ~ user '{username}' already exists")

        admin, _ = User.objects.get_or_create(
            username="admin", defaults={"email": "admin@example.com", "first_name": "Admin", "is_superuser": True, "is_staff": True}
        )
        admin.set_password("adminpass123")
        admin.is_superuser = True
        admin.is_staff = True
        admin.save()

        users = list(User.objects.exclude(username="admin"))
        sample_posts = [
            ("bob", "Just launched my new project! 🚀 Check it out and let me know what you think."),
            ("alice", "Sunset vibes tonight. Sometimes you just have to stop and enjoy the view. 🌇"),
            ("charlie", "Day 30 of my learning streak. Consistency beats intensity! 📚"),
            ("alice", "Coffee + code = best combo. What's your favorite productivity hack? ☕"),
            ("bob", "Best piece of advice I ever received: ship early, ship often."),
            ("charlie", "Anyone else love rainy days? Perfect excuse to stay in and watch movies. 🌧️"),
        ]

        for username, content in sample_posts:
            author = User.objects.get(username=username)
            post, was_created = Post.objects.get_or_create(
                author=author, content=content, defaults={"content": content}
            )
            if was_created:
                short = content[:40].encode('ascii', errors='replace').decode('ascii')
                self.stdout.write(f"  + created post by '{username}': {short}...")

        # Follows: everyone follows everyone else (a small dense graph)
        for follower in users:
            for followed in users:
                if follower == followed:
                    continue
                Follow.objects.get_or_create(follower=follower, followed=followed)

        # Likes: each user likes posts by others
        for user in users:
            for post in Post.objects.exclude(author=user)[:4]:
                Like.objects.get_or_create(user=user, post=post)

        # A few comments
        sample_comments = [
            ("alice", "bob", "This is amazing, congrats!"),
            ("bob", "alice", "Beautiful photo! 📸"),
            ("charlie", "alice", "Love this caption."),
            ("alice", "charlie", "Keep it up, inspiring!"),
            ("bob", "charlie", "Totally agree with you."),
        ]
        for username, post_author, text in sample_comments:
            user = User.objects.get(username=username)
            post = User.objects.get(username=post_author).posts.first()
            if post:
                Comment.objects.get_or_create(author=user, post=post, content=text)

        self.stdout.write(self.style.SUCCESS("Done! Demo logins:"))
        for username, _, password in demo_users:
            self.stdout.write(f"    - {username} / {password}")
        self.stdout.write("    - admin / adminpass123")