from django.urls import path

from . import views

urlpatterns = [
    # Auth
    path('register/', views.register_view, name='register'),
    path('login/', views.login_view, name='login'),
    path('logout/', views.logout_view, name='logout'),

    # Landing / Feed / Explore
    path('', views.index_view, name='home'),
    path('feed/', views.feed_view, name='feed'),
    path('explore/', views.explore_view, name='explore'),

    # Posts
    path('posts/create/', views.post_create_view, name='post_create'),
    path('posts/<int:pk>/', views.post_detail_view, name='post_detail'),
    path('posts/<int:pk>/edit/', views.post_edit_view, name='post_edit'),
    path('posts/<int:pk>/edit-inline/', views.post_edit_inline, name='post_edit_inline'),
    path('posts/<int:pk>/delete/', views.post_delete_view, name='post_delete'),
    path('posts/<int:pk>/like/', views.like_toggle_view, name='like_toggle'),
    path('posts/<int:pk>/comments/', views.comment_create_view, name='comment_create'),
    path('comments/<int:pk>/delete/', views.comment_delete_view, name='comment_delete'),

    # Profiles
    path('profile/<str:username>/follow/', views.follow_toggle_view, name='follow_toggle'),
    path('profile/<str:username>/followers/', views.followers_list_view, name='followers'),
    path('profile/<str:username>/following/', views.following_list_view, name='following'),
    path('profile/<str:username>/', views.profile_view, name='profile'),
    path('settings/', views.settings_view, name='settings'),
]