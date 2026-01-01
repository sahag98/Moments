import * as StoreReview from 'expo-store-review';


export async function checkReview() {
  const isAvailable = await StoreReview.isAvailableAsync();
  //   const { reviewRequested } = useUserStore();
  console.log('isAvailable', isAvailable);
  //   console.log('review requested: ', reviewRequested);
  if (isAvailable) {
    StoreReview.requestReview();
  }
}