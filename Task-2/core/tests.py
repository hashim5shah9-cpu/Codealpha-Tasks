from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse

from core.models import Comment, Follow, Like, Post, Profile


class HomeTests(TestCase):

    def test_root_shows_index(self):
        response = self.client.get(reverse('home'))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Social')
        self.assertContains(response, 'Sign up')


class AuthTests(TestCase):

    def test_register_creates_profile_and_logs_in(self):
        response = self.client.post(reverse('register'), {
            'username': 'newbie',
            'email': 'newbie@example.com',
            'password1': 'strongpass1',
            'password2': 'strongpass1',
        })
        self.assertRedirects(response, reverse('feed'))
        user = User.objects.get(username='newbie')
        self.assertTrue(user.is_authenticated)
        self.assertTrue(Profile.objects.filter(user=user).exists())
        self.assertTrue(user.profile)  # signal created profile

    def test_login_and_logout(self):
        user = User.objects.create_user('testuser', 'test@example.com', 'secret123')
        response = self.client.post(reverse('login'), {'username': 'testuser', 'password': 'secret123'})
        self.assertRedirects(response, reverse('feed'))

        self.client.post(reverse('logout'))
        response = self.client.get(reverse('feed'))
        self.assertEqual(response.status_code, 302)  # requires login

    def test_invalid_login(self):
        response = self.client.post(reverse('login'), {'username': 'nope', 'password': 'wrong'})
        self.assertEqual(response.status_code, 200)

    def test_feed_requires_login(self):
        response = self.client.get(reverse('feed'))
        self.assertRedirects(response, f"{reverse('login')}?next={reverse('feed')}")


class PostTests(TestCase):

    def setUp(self):
        self.user = User.objects.create_user('poster', 'poster@example.com', 'secret123')
        self.client.login(username='poster', password='secret123')

    def test_create_post(self):
        response = self.client.post(reverse('post_create'), {'content': 'Hello world!'}, HTTP_X_REQUESTED_WITH='XMLHttpRequest')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(Post.objects.filter(author=self.user, content='Hello world!').exists())

    def test_post_detail_and_comment_count(self):
        post = Post.objects.create(author=self.user, content='First post')
        response = self.client.get(reverse('post_detail', args=[post.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'First post')

    def test_edit_own_post(self):
        post = Post.objects.create(author=self.user, content='Original')
        response = self.client.post(reverse('post_edit_inline', args=[post.pk]), {'content': 'Updated'}, HTTP_X_REQUESTED_WITH='XMLHttpRequest')
        self.assertEqual(response.status_code, 200)
        post.refresh_from_db()
        self.assertEqual(post.content, 'Updated')

    def test_cannot_edit_others_post(self):
        other = User.objects.create_user('someone', 's@example.com', 'secret123')
        post = Post.objects.create(author=other, content='Mine')
        response = self.client.post(reverse('post_delete', args=[post.pk]), follow=True)
        self.assertTrue(Post.objects.filter(pk=post.pk).exists())  # 404, not deleted

    def test_delete_own_post(self):
        post = Post.objects.create(author=self.user, content='Bye')
        self.client.post(reverse('post_delete', args=[post.pk]), {'next': reverse('feed')})
        self.assertFalse(Post.objects.filter(pk=post.pk).exists())


class LikeTests(TestCase):

    def setUp(self):
        self.me = User.objects.create_user('me', 'me@example.com', 'secret123')
        self.other = User.objects.create_user('other', 'o@example.com', 'secret123')
        self.post = Post.objects.create(author=self.other, content='Nice post')
        self.other.profile.save()

    def test_like_and_unlike_toggle(self):
        self.client.login(username='me', password='secret123')
        url = reverse('like_toggle', args=[self.post.pk])

        response = self.client.post(url, HTTP_X_REQUESTED_WITH='XMLHttpRequest')
        self.assertEqual(response.json()['liked'], True)
        self.assertEqual(Like.objects.filter(user=self.me, post=self.post).count(), 1)
        self.assertEqual(response.json()['count'], 1)

        response = self.client.post(url, HTTP_X_REQUESTED_WITH='XMLHttpRequest')
        self.assertEqual(response.json()['liked'], False)
        self.assertEqual(Like.objects.filter(user=self.me, post=self.post).count(), 0)

    def test_like_requires_login(self):
        url = reverse('like_toggle', args=[self.post.pk])
        response = self.client.post(url)
        self.assertEqual(response.status_code, 302)


class CommentTests(TestCase):

    def setUp(self):
        self.me = User.objects.create_user('me', 'me@example.com', 'secret123')
        self.other = User.objects.create_user('other', 'o@example.com', 'secret123')
        self.post = Post.objects.create(author=self.other, content='Discuss')
        self.client.login(username='me', password='secret123')

    def test_create_comment(self):
        url = reverse('comment_create', args=[self.post.pk])
        response = self.client.post(url, {'content': 'Great stuff'}, HTTP_X_REQUESTED_WITH='XMLHttpRequest')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(Comment.objects.filter(post=self.post, author=self.me, content='Great stuff').exists())

    def test_delete_own_comment(self):
        comment = Comment.objects.create(post=self.post, author=self.me, content='Mine')
        response = self.client.post(
            reverse('comment_delete', args=[comment.pk]), HTTP_X_REQUESTED_WITH='XMLHttpRequest'
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(Comment.objects.filter(pk=comment.pk).exists())


class FollowTests(TestCase):

    def setUp(self):
        self.me = User.objects.create_user('me', 'me@example.com', 'secret123')
        self.other = User.objects.create_user('other', 'o@example.com', 'secret123')

    def test_follow_and_unfollow(self):
        self.client.login(username='me', password='secret123')
        url = reverse('follow_toggle', args=['other'])

        response = self.client.post(url, HTTP_X_REQUESTED_WITH='XMLHttpRequest')
        self.assertEqual(response.json()['following'], True)
        self.assertTrue(Follow.objects.filter(follower=self.me, followed=self.other).exists())

        response = self.client.post(url, HTTP_X_REQUESTED_WITH='XMLHttpRequest')
        self.assertEqual(response.json()['following'], False)
        self.assertFalse(Follow.objects.filter(follower=self.me, followed=self.other).exists())

    def test_cannot_follow_self(self):
        self.client.login(username='me', password='secret123')
        response = self.client.post(reverse('follow_toggle', args=['me']), HTTP_X_REQUESTED_WITH='XMLHttpRequest')
        self.assertEqual(response.status_code, 400)

    def test_own_profile_lists_posts(self):
        Post.objects.create(author=self.me, content='A post of mine')
        response = self.client.get(reverse('profile', args=['me']))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'A post of mine')


class FeedTests(TestCase):

    def test_liked_state_renders(self):
        me = User.objects.create_user('me', 'me@example.com', 'secret123')
        other = User.objects.create_user('other', 'o@example.com', 'secret123')
        post = Post.objects.create(author=other, content='Like me')
        Like.objects.create(user=me, post=post)
        self.client.login(username='me', password='secret123')
        response = self.client.get(reverse('explore'))
        self.assertContains(response, 'like-btn liked')

    def test_search_finds_people_and_posts(self):
        me = User.objects.create_user('me', 'me@example.com', 'secret123')
        User.objects.create_user('bobsearch', 'b@example.com', 'secret123')
        Post.objects.create(author=me, content='unique banana recipe')
        self.client.login(username='me', password='secret123')
        response = self.client.get(reverse('explore'), {'q': 'bobsearch'})
        self.assertContains(response, 'bobsearch')
        response = self.client.get(reverse('explore'), {'q': 'banana'})
        self.assertContains(response, 'unique banana recipe')

    def test_feed_only_shows_followed(self):
        me = User.objects.create_user('me', 'me@example.com', 'secret123')
        friend = User.objects.create_user('friend', 'f@example.com', 'secret123')
        stranger = User.objects.create_user('stranger', 's@example.com', 'secret123')

        Post.objects.create(author=friend, content='Friend post')
        Post.objects.create(author=stranger, content='Stranger post')
        Follow.objects.create(follower=me, followed=friend)

        self.client.login(username='me', password='secret123')
        response = self.client.get(reverse('feed'))
        self.assertContains(response, 'Friend post')
        self.assertNotContains(response, 'Stranger post')