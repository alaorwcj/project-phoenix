package metrics

import (
	"io"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Labels map[string]string

type Registry struct {
	mu         sync.RWMutex
	counters   map[string]map[string]*sample
	gauges     map[string]map[string]*sample
	histograms map[string]*histogramFamily
}

type sample struct {
	labels []labelPair
	value  float64
}

type labelPair struct {
	key   string
	value string
}

type histogramFamily struct {
	buckets []float64
	series  map[string]*histogramSeries
}

type histogramSeries struct {
	labels      []labelPair
	bucketCount []uint64
	count       uint64
	sum         float64
}

var defaultHistogramBuckets = []float64{
	0.005, 0.01, 0.025, 0.05, 0.1,
	0.25, 0.5, 1, 2.5, 5, 10,
}

func New() *Registry {
	return &Registry{
		counters:   map[string]map[string]*sample{},
		gauges:     map[string]map[string]*sample{},
		histograms: map[string]*histogramFamily{},
	}
}

func (r *Registry) IncCounter(name string, labels Labels) {
	r.AddCounter(name, labels, 1)
}

func (r *Registry) AddCounter(name string, labels Labels, delta float64) {
	if delta == 0 {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.setSample(r.counters, name, labels, delta, true)
}

func (r *Registry) SetGauge(name string, labels Labels, value float64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.setSample(r.gauges, name, labels, value, false)
}

func (r *Registry) ObserveHistogram(name string, labels Labels, value float64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	family := r.histograms[name]
	if family == nil {
		family = &histogramFamily{
			buckets: append([]float64(nil), defaultHistogramBuckets...),
			series:  map[string]*histogramSeries{},
		}
		r.histograms[name] = family
	}
	set := normalizeLabels(labels)
	series := family.series[set.key]
	if series == nil {
		series = &histogramSeries{
			labels:      set.pairs,
			bucketCount: make([]uint64, len(family.buckets)),
		}
		family.series[set.key] = series
	}
	series.count++
	series.sum += value
	for i, bucket := range family.buckets {
		if value <= bucket {
			series.bucketCount[i]++
		}
	}
}

func (r *Registry) ObserveDuration(name string, labels Labels, d time.Duration) {
	r.ObserveHistogram(name, labels, d.Seconds())
}

func (r *Registry) Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if req.URL.Path != "/metrics" {
			http.NotFound(w, req)
			return
		}
		w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
		_, _ = io.WriteString(w, r.Render())
	})
}

func (r *Registry) Render() string {
	snapshot := r.snapshot()
	var b strings.Builder

	for _, name := range sortedKeys(snapshot.counters) {
		b.WriteString("# TYPE ")
		b.WriteString(name)
		b.WriteString(" counter\n")
		for _, key := range sortedSampleKeys(snapshot.counters[name]) {
			s := snapshot.counters[name][key]
			b.WriteString(name)
			b.WriteString(renderLabels(s.labels))
			b.WriteByte(' ')
			b.WriteString(strconv.FormatFloat(s.value, 'f', -1, 64))
			b.WriteByte('\n')
		}
	}

	for _, name := range sortedKeys(snapshot.gauges) {
		b.WriteString("# TYPE ")
		b.WriteString(name)
		b.WriteString(" gauge\n")
		for _, key := range sortedSampleKeys(snapshot.gauges[name]) {
			s := snapshot.gauges[name][key]
			b.WriteString(name)
			b.WriteString(renderLabels(s.labels))
			b.WriteByte(' ')
			b.WriteString(strconv.FormatFloat(s.value, 'f', -1, 64))
			b.WriteByte('\n')
		}
	}

	for _, name := range sortedKeys(snapshot.histograms) {
		family := snapshot.histograms[name]
		b.WriteString("# TYPE ")
		b.WriteString(name)
		b.WriteString(" histogram\n")
		for _, key := range sortedHistogramKeys(family.series) {
			s := family.series[key]
			for i, bucket := range family.buckets {
				b.WriteString(name)
				b.WriteString("_bucket")
				b.WriteString(renderLabels(appendLabel(s.labels, "le", formatBucket(bucket))))
				b.WriteByte(' ')
				b.WriteString(strconv.FormatUint(s.bucketCount[i], 10))
				b.WriteByte('\n')
			}
			b.WriteString(name)
			b.WriteString("_bucket")
			b.WriteString(renderLabels(appendLabel(s.labels, "le", "+Inf")))
			b.WriteByte(' ')
			b.WriteString(strconv.FormatUint(s.count, 10))
			b.WriteByte('\n')

			b.WriteString(name)
			b.WriteString("_sum")
			b.WriteString(renderLabels(s.labels))
			b.WriteByte(' ')
			b.WriteString(strconv.FormatFloat(s.sum, 'f', -1, 64))
			b.WriteByte('\n')

			b.WriteString(name)
			b.WriteString("_count")
			b.WriteString(renderLabels(s.labels))
			b.WriteByte(' ')
			b.WriteString(strconv.FormatUint(s.count, 10))
			b.WriteByte('\n')
		}
	}

	return b.String()
}

func (r *Registry) setSample(dst map[string]map[string]*sample, name string, labels Labels, value float64, add bool) {
	set := normalizeLabels(labels)
	series := dst[name]
	if series == nil {
		series = map[string]*sample{}
		dst[name] = series
	}
	s := series[set.key]
	if s == nil {
		s = &sample{labels: set.pairs}
		series[set.key] = s
	}
	if add {
		s.value += value
		return
	}
	s.value = value
}

type normalizedLabels struct {
	key   string
	pairs []labelPair
}

func normalizeLabels(labels Labels) normalizedLabels {
	if len(labels) == 0 {
		return normalizedLabels{}
	}
	keys := make([]string, 0, len(labels))
	for key := range labels {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	pairs := make([]labelPair, 0, len(keys))
	var b strings.Builder
	for _, key := range keys {
		value := labels[key]
		pairs = append(pairs, labelPair{key: key, value: value})
		b.WriteString(strconv.Itoa(len(key)))
		b.WriteByte(':')
		b.WriteString(key)
		b.WriteByte('=')
		b.WriteString(strconv.Itoa(len(value)))
		b.WriteByte(':')
		b.WriteString(value)
		b.WriteByte(';')
	}
	return normalizedLabels{key: b.String(), pairs: pairs}
}

func (r *Registry) snapshot() *Registry {
	r.mu.RLock()
	defer r.mu.RUnlock()

	out := New()
	for name, series := range r.counters {
		out.counters[name] = cloneSamples(series)
	}
	for name, series := range r.gauges {
		out.gauges[name] = cloneSamples(series)
	}
	for name, family := range r.histograms {
		cloned := &histogramFamily{
			buckets: append([]float64(nil), family.buckets...),
			series:  map[string]*histogramSeries{},
		}
		for key, series := range family.series {
			cloned.series[key] = &histogramSeries{
				labels:      append([]labelPair(nil), series.labels...),
				bucketCount: append([]uint64(nil), series.bucketCount...),
				count:       series.count,
				sum:         series.sum,
			}
		}
		out.histograms[name] = cloned
	}
	return out
}

func cloneSamples(in map[string]*sample) map[string]*sample {
	out := make(map[string]*sample, len(in))
	for key, s := range in {
		out[key] = &sample{
			labels: append([]labelPair(nil), s.labels...),
			value:  s.value,
		}
	}
	return out
}

func sortedKeys[V any](m map[string]V) []string {
	keys := make([]string, 0, len(m))
	for key := range m {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func sortedSampleKeys(m map[string]*sample) []string {
	keys := make([]string, 0, len(m))
	for key := range m {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func sortedHistogramKeys(m map[string]*histogramSeries) []string {
	keys := make([]string, 0, len(m))
	for key := range m {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func renderLabels(labels []labelPair) string {
	if len(labels) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteByte('{')
	for i, label := range labels {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteString(label.key)
		b.WriteString(`="`)
		b.WriteString(escapeLabelValue(label.value))
		b.WriteByte('"')
	}
	b.WriteByte('}')
	return b.String()
}

func appendLabel(labels []labelPair, key, value string) []labelPair {
	out := make([]labelPair, 0, len(labels)+1)
	out = append(out, labels...)
	out = append(out, labelPair{key: key, value: value})
	return out
}

func formatBucket(bucket float64) string {
	return strconv.FormatFloat(bucket, 'f', -1, 64)
}

func escapeLabelValue(value string) string {
	value = strings.ReplaceAll(value, `\`, `\\`)
	value = strings.ReplaceAll(value, "\n", `\n`)
	value = strings.ReplaceAll(value, `"`, `\"`)
	return value
}
