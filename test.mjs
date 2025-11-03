async function main() {
    const dataPromise = new Promise((resolve, reject) => {
        setTimeout(() => {
            console.log("data promise has been settled");
            resolve("data");
        }, 1000);
    });
    const resultPromise = new Promise((resolve, reject) => {
        setTimeout(() => {
            console.log("result promise has been settled");
            resolve("result");
        }, 8000);
    });
    let results = await Promise.allSettled([dataPromise, resultPromise]);
    console.log(results, "both promises have been settled");
}
await main();