document.querySelectorAll(".video-container").forEach(container => {
      const video = container.querySelector("video");
      const overlay = container.querySelector(".scrub-overlay");
      const fill = container.querySelector(".progress-fill");

      let isScrubbing = false;
      let ready = false;

      // Wait until metadata is ready before allowing scrubbing
      video.addEventListener("loadedmetadata", () => {
        ready = Number.isFinite(video.duration);
      });

      // Playback-based progress
      video.addEventListener("timeupdate", () => {
        if (!isScrubbing && ready) {
          const percent = (video.currentTime / video.duration) * 100;
          fill.style.width = `${percent}%`;
        }
      });

      // Hover scrub behavior
      overlay.addEventListener("mousemove", (e) => {
        if (!ready) return;

        const rect = overlay.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percent = Math.min(Math.max(x / rect.width, 0), 1);

        video.currentTime = percent * video.duration;
        fill.style.width = `${percent * 100}%`;
      });

      overlay.addEventListener("mouseenter", async () => {
        if (!ready) return;

        isScrubbing = true;
        try {
          if (!video.paused) await video.play();
          video.pause();
        } catch (err) {
          if (err.name !== "AbortError") {
            console.error("Video play error:", err);
          }
        }
      });

      overlay.addEventListener("mouseleave", async () => {
        if (!ready) return;

        isScrubbing = false;
        try {
          await video.play();
        } catch (err) {
          if (err.name !== "AbortError") {
            console.error("Video play error:", err);
          }
        }
      });
    });