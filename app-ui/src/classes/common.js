export default {
  async fetch(url, options) {
    const response = await fetch(url, options);
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      if (response.ok) {
        throw new Error('Invalid server response');
      }
    }
    if (!response.ok) {
      throw new Error(data && data.message || `HTTP ${response.status}: ${response.statusText}`);
    }
    return data;
  },

  clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }
};
