import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import ReactGA from 'react-ga4';

const GA_TRACKING_ID = import.meta.env.VITE_GA_TRACKING_ID;

const Analytics = () => {
  const location = useLocation();

  useEffect(() => {
    if (GA_TRACKING_ID) {
      try {
        ReactGA.initialize(GA_TRACKING_ID);
      } catch {
        // Analytics blocked or unavailable
      }
    }
  }, []);

  useEffect(() => {
    if (GA_TRACKING_ID) {
      try {
        ReactGA.send({
          hitType: 'pageview',
          page: location.pathname + location.search,
          title: document.title,
        });
      } catch {
        // Analytics blocked or unavailable
      }
    }
  }, [location]);

  return null;
};

export default Analytics;
