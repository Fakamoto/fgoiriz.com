        const copyEmailButton = document.querySelector("[data-copy-email]");
        const copyStatus = document.querySelector("#copy-status");

        async function copyEmail(email) {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(email);
                return;
            }

            const textArea = document.createElement("textarea");
            textArea.value = email;
            textArea.setAttribute("readonly", "");
            textArea.style.position = "fixed";
            textArea.style.top = "-1000px";
            document.body.appendChild(textArea);
            textArea.select();
            const copied = document.execCommand("copy");
            textArea.remove();

            if (!copied) {
                throw new Error("Copy command failed");
            }
        }

        if (copyEmailButton) {
            const defaultLabel = copyEmailButton.textContent;

            copyEmailButton.addEventListener("click", async () => {
                const email = copyEmailButton.dataset.email;

                try {
                    await copyEmail(email);
                    copyEmailButton.textContent = "Email copied";
                    copyEmailButton.classList.add("copied");
                    if (copyStatus) {
                        copyStatus.textContent = "Email copied to clipboard.";
                    }

                    window.setTimeout(() => {
                        copyEmailButton.textContent = defaultLabel;
                        copyEmailButton.classList.remove("copied");
                        if (copyStatus) {
                            copyStatus.textContent = "";
                        }
                    }, 1800);
                } catch {
                    window.location.href = `mailto:${email}`;
                }
            });
        }
