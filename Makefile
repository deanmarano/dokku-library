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
	sudo mkdir -p $(DOKKU_PLUGINS)/available/$(PLUGIN_NAME)/subcommands
	sudo mkdir -p $(DOKKU_PLUGINS)/available/$(PLUGIN_NAME)/library
	sudo cp commands config functions install plugin.toml $(DOKKU_PLUGINS)/available/$(PLUGIN_NAME)/
	sudo cp subcommands/* $(DOKKU_PLUGINS)/available/$(PLUGIN_NAME)/subcommands/
	sudo cp -r library/* $(DOKKU_PLUGINS)/available/$(PLUGIN_NAME)/library/
	sudo chmod +x $(DOKKU_PLUGINS)/available/$(PLUGIN_NAME)/commands
	sudo chmod +x $(DOKKU_PLUGINS)/available/$(PLUGIN_NAME)/subcommands/*
	sudo dokku plugin:enable $(PLUGIN_NAME) || true
	sudo bash $(DOKKU_PLUGINS)/enabled/$(PLUGIN_NAME)/install

uninstall:
	sudo dokku plugin:disable $(PLUGIN_NAME) || true
	sudo rm -rf $(DOKKU_PLUGINS)/available/$(PLUGIN_NAME)

clean:
	rm -rf node_modules playwright-report test-results

setup:
	npm install
	npx playwright install --with-deps
