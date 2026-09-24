from django.contrib import messages
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.db.models import BooleanField, Count, Exists, OuterRef, Q, Value
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.http import require_POST

from .forms import CommentForm, LoginForm, PostForm, ProfileForm, RegisterForm, UserForm
from .models import Comment, Follow, Like, Post, Profile


def _wants_json(request):
    return (
        request.headers.get('X-Requested-With') == 'XMLHttpRequest'
        or request.content_type == 'application/json'
        or 'application/json' in request.headers.get('Accept', '')
    )


def index_view(request):
    return render(request, 'index.html')


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

def register_view(request):
    if request.user.is_authenticated:
        return redirect('feed')

    if request.method == 'POST':
        form = RegisterForm(request.POST)
        if form.is_valid():
            user = form.save()
            login(request, user)
            messages.success(request, f"Welcome to SocialMedia, {user.username}!")
            return redirect('feed')
        else:
            messages.error(request, "Please correct the errors below.")
    else:
        form = RegisterForm()

    return render(request, 'auth/register.html', {'form': form})


def login_view(request):
    if request.user.is_authenticated:
        return redirect('feed')

    if request.method == 'POST':
        form = LoginForm(request.POST)
        if form.is_valid():
            username = form.cleaned_data['username']
            password = form.cleaned_data['password']
            user = authenticate(request, username=username, password=password)
            if user is not None:
                login(request, user)
                messages.success(request, f"Logged in as {user.username}.")
                next_url = request.GET.get('next') or request.POST.get('next') or ''
                if not url_has_allowed_host_and_scheme(
                    next_url,
                    allowed_hosts={request.get_host()},
                    require_https=request.is_secure(),
                ):
                    next_url = 'feed'
                return redirect(next_url)
            messages.error(request, "Invalid username or password.")
    else:
        form = LoginForm()

    return render(request, 'auth/login.html', {'form': form})


@login_required
def logout_view(request):
    if request.method == 'POST':
        logout(request)
        messages.info(request, "You have been logged out.")
        return redirect('login')
    return redirect('feed')


# ---------------------------------------------------------------------------
# Feed & Explore
# ---------------------------------------------------------------------------

def _posts_for(user):
    """Posts with like/comment counts and whether this user has liked each one."""
    qs = (
        Post.objects
        .select_related('author', 'author__profile')
        .annotate(
            like_count=Count('likes', distinct=True),
            comment_count=Count('comments', distinct=True),
        )
    )
    if getattr(user, 'is_authenticated', False):
        qs = qs.annotate(
            user_liked=Exists(Like.objects.filter(post=OuterRef('pk'), user=user))
        )
    else:
        qs = qs.annotate(user_liked=Value(False, output_field=BooleanField()))
    return qs


def _people_queryset(viewer):
    qs = User.objects.select_related('profile')
    if getattr(viewer, 'is_authenticated', False):
        qs = qs.annotate(
            is_followed=Exists(
                Follow.objects.filter(follower=viewer, followed=OuterRef('pk'))
            )
        )
    else:
        qs = qs.annotate(is_followed=Value(False, output_field=BooleanField()))
    return qs


@login_required
def feed_view(request):
    following_ids = request.user.following.values_list('followed_id', flat=True)
    user_ids = list(following_ids) + [request.user.id]

    posts = _posts_for(request.user).filter(author_id__in=user_ids)

    post_form = PostForm()
    return render(request, 'feed.html', {
        'posts': posts,
        'post_form': post_form,
        'active_page': 'feed',
        'section_title': 'Your Feed',
        'suggested_users': _suggested_users(request.user),
    })


def _suggested_users(user, limit=5):
    followed_ids = user.following.values_list('followed_id', flat=True)
    return (
        User.objects
        .exclude(pk__in=list(followed_ids) + [user.pk])
        .annotate(post_count=Count('posts'))
        .order_by('-post_count')[:limit]
    )


@login_required
def explore_view(request):
    query = request.GET.get('q', '').strip()
    posts = _posts_for(request.user)
    people = []

    if query:
        posts = posts.filter(
            Q(content__icontains=query) | Q(author__username__icontains=query)
        )
        people = (
            _people_queryset(request.user)
            .filter(
                Q(username__icontains=query)
                | Q(first_name__icontains=query)
                | Q(last_name__icontains=query)
            )
            .exclude(pk=request.user.pk)[:12]
        )

    return render(request, 'feed.html', {
        'posts': posts,
        'post_form': PostForm(),
        'active_page': 'explore',
        'section_title': f'Search: {query}' if query else 'Explore',
        'query': query,
        'people': people,
        'suggested_users': _suggested_users(request.user),
    })


# ---------------------------------------------------------------------------
# Posts
# ---------------------------------------------------------------------------

@login_required
@require_POST
def post_create_view(request):
    form = PostForm(request.POST, request.FILES)
    if form.is_valid():
        post = form.save(commit=False)
        post.author = request.user
        post.save()
        messages.success(request, "Post published.")
        if _wants_json(request):
            return JsonResponse({'status': 'ok', 'id': post.pk, 'redirect': post.get_absolute_url()})
        return redirect(request.POST.get('next') or 'feed')
    messages.error(request, "Could not publish post.")
    if _wants_json(request):
        return JsonResponse({'status': 'error', 'errors': form.errors}, status=400)
    return redirect(request.POST.get('next') or 'feed')


@login_required
def post_detail_view(request, pk):
    post = get_object_or_404(_posts_for(request.user), pk=pk)
    comments = (
        post.comments
        .select_related('author', 'author__profile')
    )
    context = {
        'post': post,
        'comments': comments,
        'comment_form': CommentForm(),
        'liked': post.is_liked_by(request.user),
    }
    return render(request, 'post_detail.html', context)


@login_required
@require_POST
def post_edit_view(request, pk):
    post = get_object_or_404(Post, pk=pk, author=request.user)
    form = PostForm(request.POST, request.FILES, instance=post)
    if form.is_valid():
        form.save()
        messages.success(request, "Post updated.")
        return redirect('post_detail', pk=post.pk)
    messages.error(request, "Could not update post.")
    return redirect('post_detail', pk=post.pk)


@login_required
@require_POST
def post_delete_view(request, pk):
    post = get_object_or_404(Post, pk=pk, author=request.user)
    post.delete()
    messages.info(request, "Post deleted.")
    return redirect(request.POST.get('next') or 'feed')


@login_required
@require_POST
def post_edit_inline(request, pk):
    """Return/edit post content inline (used by the JS front-end)."""
    post = get_object_or_404(Post, pk=pk, author=request.user)
    if request.method == 'POST':
        content = request.POST.get('content', '').strip()
        if not content:
            return JsonResponse({'status': 'error', 'errors': 'Content cannot be empty.'}, status=400)
        post.content = content
        post.save()
        return JsonResponse({'status': 'ok', 'content': post.content})
    return JsonResponse({'status': 'error'}, status=405)


# ---------------------------------------------------------------------------
# Likes
# ---------------------------------------------------------------------------

@login_required
@require_POST
def like_toggle_view(request, pk):
    post = get_object_or_404(Post, pk=pk)
    like, created = Like.objects.get_or_create(user=request.user, post=post)
    if not created:
        like.delete()
        liked = False
    else:
        liked = True

    data = {'status': 'ok', 'liked': liked, 'count': post.likes.count()}
    if _wants_json(request):
        return JsonResponse(data)
    return redirect(request.POST.get('next') or request.META.get('HTTP_REFERER') or 'feed')


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------

@login_required
@require_POST
def comment_create_view(request, pk):
    post = get_object_or_404(Post, pk=pk)
    form = CommentForm(request.POST)
    if form.is_valid():
        comment = form.save(commit=False)
        comment.post = post
        comment.author = request.user
        comment.save()
        if _wants_json(request):
            return JsonResponse({
                'status': 'ok',
                'id': comment.pk,
                'author': comment.author.username,
                'content': comment.content,
                'created_at': comment.created_at.strftime('%b %d, %Y %H:%M'),
            })
        return redirect('post_detail', pk=post.pk)

    if _wants_json(request):
        return JsonResponse({'status': 'error', 'errors': form.errors}, status=400)
    messages.error(request, "Comment could not be posted.")
    return redirect('post_detail', pk=post.pk)


@login_required
@require_POST
def comment_delete_view(request, pk):
    comment = get_object_or_404(Comment, pk=pk, author=request.user)
    post_pk = comment.post.pk
    comment.delete()
    if _wants_json(request):
        return JsonResponse({'status': 'ok', 'count': Post.objects.get(pk=post_pk).comments.count()})
    return redirect('post_detail', pk=post_pk)


# ---------------------------------------------------------------------------
# Profiles & Follows
# ---------------------------------------------------------------------------

def profile_view(request, username):
    user = get_object_or_404(User, username=username)
    profile, _ = Profile.objects.get_or_create(user=user)

    posts = _posts_for(request.user).filter(author=user)

    is_following = False
    if request.user.is_authenticated and request.user != user:
        is_following = Follow.objects.filter(follower=request.user, followed=user).exists()

    context = {
        'profile_user': user,
        'profile': profile,
        'posts': posts,
        'is_following': is_following,
        'is_own_profile': request.user == user,
        'followers_count': user.followers.count(),
        'following_count': user.following.count(),
        'posts_count': user.posts.count(),
    }
    return render(request, 'profile.html', context)


@login_required
@require_POST
def follow_toggle_view(request, username):
    target = get_object_or_404(User, username=username)
    if target == request.user:
        return JsonResponse({'status': 'error', 'message': 'You cannot follow yourself.'}, status=400)

    follow, created = Follow.objects.get_or_create(follower=request.user, followed=target)
    if not created:
        follow.delete()
        following = False
    else:
        following = True

    data = {
        'status': 'ok',
        'following': following,
        'count': target.followers.count(),
    }
    if _wants_json(request):
        return JsonResponse(data)
    return redirect(request.POST.get('next') or 'profile', username=username)


@login_required
def followers_list_view(request, username):
    user = get_object_or_404(User, username=username)
    follower_ids = user.followers.values_list('follower_id', flat=True)
    items = _people_queryset(request.user).filter(pk__in=follower_ids)
    return render(request, 'user_list.html', {
        'profile_user': user,
        'items': items,
        'list_title': 'Followers',
        'active_page': '',
    })


@login_required
def following_list_view(request, username):
    user = get_object_or_404(User, username=username)
    followed_ids = user.following.values_list('followed_id', flat=True)
    items = _people_queryset(request.user).filter(pk__in=followed_ids)
    return render(request, 'user_list.html', {
        'profile_user': user,
        'items': items,
        'list_title': 'Following',
        'active_page': '',
    })


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

@login_required
def settings_view(request):
    if request.method == 'POST':
        user_form = UserForm(request.POST, instance=request.user)
        profile_form = ProfileForm(request.POST, request.FILES, instance=request.user.profile)
        if user_form.is_valid() and profile_form.is_valid():
            user_form.save()
            profile_form.save()
            messages.success(request, "Profile updated successfully.")
            return redirect('profile', username=request.user.username)
        messages.error(request, "Please correct the errors below.")
    else:
        user_form = UserForm(instance=request.user)
        profile_form = ProfileForm(instance=request.user.profile)

    return render(request, 'settings.html', {
        'user_form': user_form,
        'profile_form': profile_form,
    })
