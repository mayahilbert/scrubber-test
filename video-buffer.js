document.addEventListener('DOMContentLoaded', (event) => {
    document.querySelectorAll(".video-container").forEach(container => {

    const video = container.querySelector("video");
    const spinner = document.querySelector('.loading-spinner');

    video.addEventListener('waiting', () => {
        spinner.style.display = 'block'; // Show spinner when video is buffering
        console.log('waiting')
    });

    video.addEventListener('canplaythrough', () => {
        spinner.style.display = 'none'; // Hide spinner when video can play
    });

    video.addEventListener('playing', () => {
        spinner.style.display = 'none'; // Also hide spinner when video is playing
    });
});
});