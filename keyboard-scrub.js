document.querySelectorAll(".video-container").forEach(container => {
    const video = container.querySelector("video");
    const overlay = container.querySelector(".scrub-overlay");
    const fill = container.querySelector(".progress-fill");

    let isScrubbing = false;
    let ready = false;

    // Frame rate (adjust to your video's actual frame rate)
    const frameRate = 10;

    // Wait until metadata is ready before allowing interaction
    video.addEventListener("loadedmetadata", () => {
        ready = Number.isFinite(video.duration);
    });

    // Playback-based progress bar
    video.addEventListener("timeupdate", () => {
        if (ready) {
            const percent = (video.currentTime / video.duration) * 100;
            fill.style.width = `${percent}%`;
        }
    });

    // OPTIONAL: Pause video when entering the overlay
    overlay.addEventListener("mouseenter", async () => {
        if (!ready) return;
        isScrubbing = true;
        try {
            if (!video.paused) await video.play();
            video.pause();
        } catch (err) {
            if (err.name !== "AbortError") console.error("Video play error:", err);
        }
    });

    // OPTIONAL: Resume playback on mouse leave
    overlay.addEventListener("mouseleave", async () => {
        if (!ready) return;
        isScrubbing = false;
        try {
            await video.play();
        } catch (err) {
            if (err.name !== "AbortError") console.error("Video play error:", err);
        }
    });
});

// Frame-by-frame control via arrow keys for all videos
document.addEventListener("keydown", (e) => {
    // Optional: Only allow control when hovering or video is in focus
    const activeContainer = document.querySelector(".video-container:hover");
    if (!activeContainer) return;

    const video = activeContainer.querySelector("video");
    if (!video || !Number.isFinite(video.duration)) return;

    const frameRate = 10;
    if (e.code === "ArrowRight") {
        video.currentTime = Math.min(video.duration, video.currentTime + 1 / frameRate);
    } else if (e.code === "ArrowLeft") {
        video.currentTime = Math.max(0, video.currentTime - 1 / frameRate);
    }
});

