from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.contrib.auth.models import User

from .models import Comment, Follow, Like, Post, Profile


class ProfileInline(admin.StackedInline):
    model = Profile
    can_delete = False


class UserAdminWithProfile(UserAdmin):
    inlines = (ProfileInline,)


admin.site.unregister(User)
admin.site.register(User, UserAdminWithProfile)


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'bio', 'created_at')
    search_fields = ('user__username', 'user__email')


@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = ('pk', 'author', 'created_at', 'likes_count', 'comments_count')
    list_filter = ('created_at',)
    search_fields = ('author__username', 'content')
    list_select_related = ('author',)

    @admin.display(description='Likes')
    def likes_count(self, obj):
        return obj.likes.count()

    @admin.display(description='Comments')
    def comments_count(self, obj):
        return obj.comments.count()


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ('pk', 'author', 'post', 'created_at')
    search_fields = ('author__username', 'content')
    list_select_related = ('author', 'post')


@admin.register(Like)
class LikeAdmin(admin.ModelAdmin):
    list_display = ('user', 'post', 'created_at')
    list_select_related = ('user', 'post')


@admin.register(Follow)
class FollowAdmin(admin.ModelAdmin):
    list_display = ('follower', 'followed', 'created_at')
    list_select_related = ('follower', 'followed')