# My website based on Type on Strap 🎨

```
apt-get install ruby-dev ruby-bundler

gem install --user-install bundler
gem install --user-install jekyll

bundle config set --local path 'vendor/bundle'
bundle install

export PATH=$PATH:~/.gem/ruby/2.7.0/bin

bundle exec jekyll serve
bundle exec jekyll serve --host=0.0.0.0

# Update remote
git remote add template https://github.com/sylhare/Type-on-Strap
git fetch --all
git merge template/master

```


