.PHONY: pc-bump generate deploy-rules

PC_REPO := https://github.com/mpragnarok/prototype-comments

# Deploy Firestore security rules to the shared comment project (prototype-comments-27106).
# Project is pinned in .firebaserc, so no --project flag needed.
# 改 firestore.rules 或 pc.js resolvePayload() 欄位後，跑這個讓線上規則同步。
deploy-rules:
	firebase deploy --only firestore:rules

# Fetch latest SHA from prototype-comments main, update generate.cjs, regenerate HTML.
# Run this whenever pc.js changes upstream.
pc-bump:
	$(eval SHA := $(shell git ls-remote $(PC_REPO) main | cut -c1-12))
	@echo "Bumping pc.js SHA to $(SHA)..."
	sed -i '' "s|prototype-comments@[a-f0-9]*|prototype-comments@$(SHA)|g" docs/poc-flow-src/generate.cjs
	$(MAKE) generate
	@echo "Done — SHA pinned to $(SHA). Deploy when ready."

generate:
	node docs/poc-flow-src/generate.cjs
