# Build the Sovereign Docker image
IMAGE_NAME ?= sovereign
IMAGE_VERSION ?= local
DOCKERFILE ?= Dockerfile
BUILD_CONTEXT ?= .
HOST_PORT ?= 4000
CONTAINER_PORT ?= 4000
DATA_DIR ?= $(CURDIR)/data
ENV_FILE ?= .env
CONTAINER_NAME ?= sovereign
REPLACE_EXISTING ?= false

DOCKER_RUN_ARGS = -d --rm --name $(CONTAINER_NAME) -p $(HOST_PORT):$(CONTAINER_PORT) -v $(DATA_DIR):/app/data
ifneq ($(wildcard $(ENV_FILE)),)
DOCKER_RUN_ARGS += --env-file $(ENV_FILE)
endif

.PHONY: docker-build
docker-build:
	@docker build -t $(IMAGE_NAME):$(IMAGE_VERSION) -f $(DOCKERFILE) $(BUILD_CONTEXT)

.PHONY: docker-run
docker-run:
	@mkdir -p $(DATA_DIR)
	@chmod 777 $(DATA_DIR)
ifeq ($(REPLACE_EXISTING),true)
	@docker rm -f $(CONTAINER_NAME) >/dev/null 2>&1 || true
endif
	@docker run $(DOCKER_RUN_ARGS) $(IMAGE_NAME):$(IMAGE_VERSION)
