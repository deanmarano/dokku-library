.PHONY: lint test test-unit test-e2e install clean

SHELL := /bin/bash
PLUGIN_NAME := library
DOKKU_PLUGINS := /var/lib/dokku/plugins

lint:
	shellcheck -x commands config install functions subcommands/*

test: test-unit

test-unit:
	npm run test:unit

test-e2e:
	npm run test:e2e

install:
	sudo ln -sf $(CURDIR) $(DOKKU_PLUGINS)/available/$(PLUGIN_NAME)
	sudo dokku plugin:enable $(PLUGIN_NAME)

uninstall:
	sudo dokku plugin:disable $(PLUGIN_NAME) || true
	sudo rm -f $(DOKKU_PLUGINS)/available/$(PLUGIN_NAME)

clean:
	rm -rf node_modules playwright-report test-results

setup:
	npm install
	npx playwright install --with-deps
