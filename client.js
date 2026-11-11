/**
 * dsh-local-session-delete — Client half (plain web bundle, no React).
 *
 * Registers a `session` target contribution in the shared context menu
 * (`ctx.contextMenus`): 删除会话. Choosing it asks for confirmation, then calls
 * the host route `POST /dsh-local-session-delete/delete`, which removes the
 * session's log directory, projection cache and workspace membership.
 */
window.__ModuleLoader__.load({
	id: "dsh-local-session-delete",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

		var ROUTE = "dsh-local-session-delete/delete";
		var STYLE_ID = "dsh-local-session-delete-style";

		var TEXT = {
			zh: {
				label: "删除会话",
				menuHint: "",
				title: "删除会话",
				body: function (t) {
					return "将永久删除会话“" + t + "”的本地记录（日志文件、投影缓存与工作区登记），不可恢复。";
				},
				bodyUntitled: "将永久删除该会话的本地记录（日志文件、投影缓存与工作区登记），不可恢复。",
				cancel: "取消",
				confirm: "永久删除",
				busy: "删除中…",
				ok: "会话已删除",
				live: "该会话正在使用中（已打开或正在运行），请先切到其他会话或重启 DSH 后再删除。",
				missing: "找不到该会话的本地记录，可能已经被删除。",
				rmFailed: "删除文件失败：",
				failed: "删除失败，请查看 DSH 日志。"
			},
			en: {
				label: "Delete session",
				menuHint: "",
				title: "Delete session",
				body: function (t) {
					return "Permanently delete all local records of “" + t + "” (log file, projection cache and workspace membership). This cannot be undone.";
				},
				bodyUntitled: "Permanently delete all local records of this session (log file, projection cache and workspace membership). This cannot be undone.",
				cancel: "Cancel",
				confirm: "Delete",
				busy: "Deleting…",
				ok: "Session deleted",
				live: "This session is in use (open or running). Switch away or restart DSH, then delete it.",
				missing: "No local records found for this session; it may already be gone.",
				rmFailed: "Failed to remove files: ",
				failed: "Delete failed. Check the DSH log."
			}
		};

		function pickLanguage(ctx) {
			try {
				var locale = ctx.get ? ctx.get("locale") : undefined;
				var snapshot = locale && typeof locale.getLocale === "function" ? locale.getLocale() : undefined;
				var id = typeof snapshot === "string" ? snapshot : snapshot && typeof snapshot.id === "string" ? snapshot.id : "";
				if (id.toLowerCase().indexOf("en") === 0) return "en";
			} catch (e) {}
			try {
				if ((navigator.language || "").toLowerCase().indexOf("en") === 0) return "en";
			} catch (e) {}
			return "zh";
		}

		function ensureStyle() {
			if (document.getElementById(STYLE_ID) !== null) return;
			var style = document.createElement("style");
			style.id = STYLE_ID;
			style.textContent = [
				".dshlsd-overlay{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.42)}",
				".dshlsd-modal{width:min(420px,calc(100vw - 48px));box-sizing:border-box;padding:20px;border-radius:14px;background:var(--dsw-alias-button-elevated-fill,#fff);color:var(--dsw-alias-label-primary,#1a1a1a);border:1px solid var(--dsw-alias-border-l,rgba(0,0,0,.08));box-shadow:0 18px 48px rgba(0,0,0,.28)}",
				".dshlsd-title{margin:0 0 8px;font-size:16px;font-weight:600;line-height:24px}",
				".dshlsd-body{margin:0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary,#555);white-space:pre-wrap;word-break:break-word}",
				".dshlsd-error{margin:10px 0 0;font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary,#d92d20);white-space:pre-wrap}",
				".dshlsd-footer{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}",
				".dshlsd-btn{min-width:78px;height:32px;padding:0 14px;border-radius:8px;font-size:13px;cursor:pointer;border:1px solid var(--dsw-alias-border-l,rgba(9,9,11,.2));background:transparent;color:inherit}",
				".dshlsd-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}",
				".dshlsd-danger{border-color:transparent;background:var(--dsw-alias-state-error-primary,#d92d20);color:#fff}",
				".dshlsd-danger:hover{background:var(--dsw-alias-state-error-primary,#d92d20);opacity:.88}",
				".dshlsd-danger:disabled{opacity:.55;cursor:default}"
			].join("\n");
			document.head.appendChild(style);
		}

		function openConfirm(texts, title, onConfirm) {
			ensureStyle();
			var overlay = document.createElement("div");
			overlay.className = "dshlsd-overlay";
			var modal = document.createElement("div");
			modal.className = "dshlsd-modal";
			modal.setAttribute("role", "dialog");
			modal.setAttribute("aria-modal", "true");

			var heading = document.createElement("div");
			heading.className = "dshlsd-title";
			heading.textContent = texts.title;
			var body = document.createElement("div");
			body.className = "dshlsd-body";
			body.textContent = title ? texts.body(title) : texts.bodyUntitled;
			var error = document.createElement("div");
			error.className = "dshlsd-error";
			error.setAttribute("role", "alert");
			var footer = document.createElement("div");
			footer.className = "dshlsd-footer";

			var cancel = document.createElement("button");
			cancel.type = "button";
			cancel.className = "dshlsd-btn";
			cancel.textContent = texts.cancel;
			var confirm = document.createElement("button");
			confirm.type = "button";
			confirm.className = "dshlsd-btn dshlsd-danger";
			confirm.textContent = texts.confirm;

			footer.appendChild(cancel);
			footer.appendChild(confirm);
			modal.appendChild(heading);
			modal.appendChild(body);
			modal.appendChild(error);
			modal.appendChild(footer);
			overlay.appendChild(modal);

			function close() {
				document.removeEventListener("keydown", onKey, true);
				if (overlay.parentNode !== null) overlay.parentNode.removeChild(overlay);
			}
			function onKey(event) {
				if (event.key === "Escape") {
					event.stopPropagation();
					close();
				}
			}

			cancel.addEventListener("click", close);
			overlay.addEventListener("pointerdown", function (event) {
				if (event.target === overlay) close();
			});
			document.addEventListener("keydown", onKey, true);

			confirm.addEventListener("click", async function () {
				confirm.disabled = true;
				cancel.disabled = true;
				confirm.textContent = texts.busy;
				error.textContent = "";
				var failure = await onConfirm();
				cancel.disabled = false;
				if (failure === null) {
					close();
					return;
				}
				error.textContent = failure;
				confirm.disabled = false;
				confirm.textContent = texts.confirm;
			});

			document.body.appendChild(overlay);
			confirm.focus();
		}

		function apply(ctx) {
			var texts = TEXT[pickLanguage(ctx)];
			var menus = ctx.contextMenus || (ctx.get ? ctx.get("contextMenus") : undefined);
			if (!menus || typeof menus.register !== "function") {
				console.warn("[dsh-local-session-delete] context menu service unavailable");
				return;
			}

			function notify(message, success) {
				try {
					if (typeof menus.notify === "function") {
						menus.notify(message, success);
						return;
					}
				} catch (e) {
					console.warn("[dsh-local-session-delete] notify failed", e);
				}
				console.log("[dsh-local-session-delete]", message);
			}

			function endpoint() {
				try {
					return new URL(ROUTE, document.baseURI).href;
				} catch (e) {
					return "/" + ROUTE;
				}
			}

			async function removeSession(sessionId) {
				var response;
				try {
					response = await fetch(endpoint(), {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ sessionId: sessionId })
					});
				} catch (e) {
					return texts.failed;
				}
				var data = null;
				try {
					data = await response.json();
				} catch (e) {}
				if (response.ok && data && data.ok) {
					notify(texts.ok, true);
					return null;
				}
				var code = data && data.code;
				if (code === "live") return texts.live;
				if (code === "missing") return texts.missing;
				if (code === "rm-failed" || code === "ambiguous") return texts.rmFailed + (data && data.detail ? String(data.detail) : "");
				return texts.failed;
			}

			function askAndDelete(sessionId, title) {
				openConfirm(texts, title, function () {
					return removeSession(sessionId);
				});
			}

			ctx.effect(function () {
				return menus.register({
					id: "dsh-local-session-delete",
					target: "session",
					order: 700,
					resolve: function (target) {
						var sessionId = target && target.sessionId;
						if (typeof sessionId !== "string" || sessionId === "") return [];
						return [
							{
								id: "delete",
								label: texts.label,
								danger: true,
								separatorBefore: true,
								run: function () {
									askAndDelete(sessionId, target.displayTitle);
								}
							}
						];
					}
				});
			}, "local session delete: menu contribution");
		}

		exports.apply = apply;
		exports.inject = ["contextMenus"];
		return module.exports;
	}
});
